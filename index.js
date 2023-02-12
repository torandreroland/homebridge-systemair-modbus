var Service, Characteristic, HapStatusError, HAPStatus;
var ModbusRTU = require("modbus-serial");

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  HapStatusError = homebridge.hap.HapStatusError;
  HAPStatus = homebridge.hap.HAPStatus;
  homebridge.registerAccessory("homebridge-systemair-modbus", "systemairModbus", Ventilation);
};

function Ventilation(log, config) {
  this.log = log;

  this.name = config.name;
  this.manufacturer = config.manufacturer || "Systemair";
  this.model = config.model || "VTR300";
  this.serial = config.serial || "SN1";
  this.pollInterval = config.pollInterval || 5;

  this.host = config.host;
  this.port = config.port;
  this.slave = config.slave;
  this.temperatureDisplayUnits = config.temperatureDisplayUnits || 0;

  this.replacementTimeInMonthsRegister = config.replacementTimeInMonthsRegister || 600;
  this.elapsedDaysSinceFilterChangeRegister = config.elapsedDaysSinceFilterChangeRegister || 601;
  this.fanSpeedLevelRegister = config.fanSpeedLevelRegister || 100;
  this.rotorRelayActiveRegister = config.rotorRelayActiveRegister || 351;
  this.temperatureSetPointLevelRegister = config.temperatureSetPointLevelRegister || 206;
  this.temperatureSetPointRegister = config.temperatureSetPointRegister || 207;
  this.currentTemperatureRegister = config.currentTemperatureRegister || 217;
  this.temperatureScaling = config.temperatureScaling || 10;
  this.targetTemperatureProperties = config.targetTemperatureProperties || {
    "minValue": 12,
    "maxValue": 22,
    "minStep": 1
  };
  this.targetHeatingCoolingStateValidValues = {
    "validValues": [0, 1]
  };

  this.connected = false;
  this.logConnectionError = true;
  this.timeoutId = null;
  this.pollCharacteristics = [];

  this.filterChangeIndication = 0;
  this.elapsedDaysSinceFilterChange = -1;

  this.fanOn = true;
  this.fanLevel = 2;
  this.fanSpeed = 67;

  this.targetTemperature = 20;
  this.setPointLevelDifference = this.targetTemperatureProperties.minValue - 1;
  this.setPoint = this.targetTemperature - this.setPointLevelDifference;
  this.currentTemperature = 20;
  this.targetHeatingCoolingState = 1;
  this.currentHeatingCoolingState = 1;

}

Ventilation.prototype = {

  identify: function(callback) {
    callback();
  },

  errorLogging: function(error, service, characteristic, cachedValue) {
    this.connected = (this.client.isOpen) ? true : false;
    if (this.connected == false) {
      this.log.error("Lost connection to Modbus TCP-server, continuously trying to reconnect...");
    }
    if (error.errno  == "ETIMEDOUT") {
      this.log.debug("Timed out when fetching characteristic '%s' for service '%s'. Using cached value %s.", characteristic.displayName, service.displayName, cachedValue)
    }
  },

  runModbus: function() {
    this.connected ? poll.bind(this)() : connectClient.bind(this)();
    setTimeout(() => this.runModbus.bind(this)(), this.pollInterval * 1000);

    function connectClient() {
      this.client = new ModbusRTU();
  
      let connect = function() {
        this.client.connectTCP(this.host, {
          port: this.port
        })
          .then((response) => {
            this.client.setID(this.slave);
            this.client.setTimeout(2500);
            this.connected = true;
            if (this.timeoutId !== null) {
              clearTimeout(this.timeoutId);
              this.timeoutId = null;
            }
            this.logConnectionError = true;
            this.log("Connected to Modbus TCP-server.");
          })
          .catch((error) => {
            if (this.logConnectionError == true) {
              if (error.errno  == "ECONNREFUSED") {
                this.log.error("Host %s:%s refused connection.", this.host, this.port)
              } else if (error.errno  == -113) {
                this.log.error("Host %s:%s is unreachable.", this.host, this.port)
              } else {
                this.log.error(error);
              }
              this.logConnectionError = false;
              this.timeoutId = setTimeout(() => {this.logConnectionError = true;}, 600000);
            }
          })
      };
  
      this.client.close(connect.bind(this));
    };

    function poll() {
      this.pollCharacteristics.forEach((characteristic) => characteristic.getValue());
    };
  },

  getServices: function() {
    this.informationService = new Service.AccessoryInformation();
    this.informationService
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.serial);

    this.filterMaintenanceService = new Service.FilterMaintenance(this.name + " Filter");
    this.filterMaintenanceService
      .getCharacteristic(Characteristic.FilterChangeIndication)
      .onGet(
        async () => {
          try {
            let responseMonths = await this.client.readHoldingRegisters(this.replacementTimeInMonthsRegister, 1)
            let responseDays = await this.client.readHoldingRegisters(this.elapsedDaysSinceFilterChangeRegister, 1)

            const respondedFilterChangeIndication = (responseDays.data[0] > responseMonths.data[0] * 30) ? 1 : 0;
            if (respondedFilterChangeIndication != this.filterChangeIndication) {
              this.log("Received updated filterChangeIndication from unit. Changing from %s to %s based on number of days passed: %s.", this.filterChangeIndication, respondedFilterChangeIndication, responseDays.data[0]);
            }
            if (responseDays.data[0] !== this.elapsedDaysSinceFilterChange) {
              this.log("It has now been %s day(s) since the filter was replaced.", responseDays.data[0]);
            }
            this.filterChangeIndication = respondedFilterChangeIndication;
            this.elapsedDaysSinceFilterChange = responseDays.data[0];
            return this.filterChangeIndication;
          }
          catch(error) {
            this.errorLogging(error, this.filterMaintenanceService, this.filterMaintenanceService.getCharacteristic(Characteristic.FilterChangeIndication), this.filterChangeIndication);
            if (this.connected == false) {
              throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
            }
            return this.filterChangeIndication;
          }
        }
      )
    
    this.fanService = new Service.Fanv2(this.name + " Fan");
    this.fanService
      .getCharacteristic(Characteristic.Active)
      .onGet(
        async () => {
          try {
            let response = await this.client.readHoldingRegisters(this.fanSpeedLevelRegister, 1)

            const respondedFanOn = (response.data[0] == 0) ? false : true;
            if (respondedFanOn != this.fanOn) {
              this.log("Received updated fanOn from unit. Changing from %s to %s.", this.fanOn, respondedFanOn);
            }
            this.fanOn = respondedFanOn;
            return this.fanOn;
          }
          catch(error) {
            this.errorLogging(error, this.fanService, this.fanService.getCharacteristic(Characteristic.Active), this.fanOn);
            if (this.connected == false) {
              throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
            }
            return this.fanOn;
          }
        }
      )
      .onSet(
        async (value) => {
          const targetFanLevel = (value == true) ? this.fanLevel : 0;
          this.log("Setting fanOn %s and fanLevel %s.", value, targetFanLevel);
          try {
            let response = await this.client.writeRegisters(this.fanSpeedLevelRegister, [targetFanLevel])

            this.fanOn = value;
          }
          catch(error) {
            this.errorLogging(error, this.fanService, this.fanService.getCharacteristic(Characteristic.Active), this.fanOn);
            if (this.connected == false) {
              throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
            }
          }
        }
      )
    this.fanService
      .addCharacteristic(Characteristic.RotationSpeed)
      .onGet(
        async () => {
          try {
            let response = await this.client.readHoldingRegisters(this.fanSpeedLevelRegister, 1)

            let respondedFanSpeed;
            switch (true) {
              case ( response.data[0] == 0):
                respondedFanSpeed = 0;
                break;
              case ( response.data[0] == 1):
                respondedFanSpeed = 33;
                break;
              case ( response.data[0] == 2):
                respondedFanSpeed = 67;
                break;
              default:
                respondedFanSpeed = 100;
                break;
            }
    
            if (respondedFanSpeed != this.fanSpeed) {
              this.log("Received updated rotationSpeed from unit. Changing from %s to %s.", this.fanSpeed, respondedFanSpeed);
            }
            this.fanSpeed = respondedFanSpeed
            return this.fanSpeed;
          }
          catch(error) {
            this.errorLogging(error, this.fanService, this.fanService.getCharacteristic(Characteristic.RotationSpeed), this.fanSpeed);
            if (this.connected == false) {
              throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
            }
            return this.fanSpeed;
          }
        }
      )
      .onSet(
        async (value) => {
          switch (true) {
            case ( value == 0):
              this.fanLevel = 0;
              break;
            case ( value < 34):
              this.fanLevel = 1;
              break;
            case ( value < 68):
              this.fanLevel = 2;
              break;
            default:
              this.fanLevel = 3;
              break;
          }
          this.log("Setting rotationSpeed %s as fanLevel %s.", value, this.fanLevel);
          try {       
            let response = await this.client.writeRegisters(this.fanSpeedLevelRegister, [this.fanLevel])

            this.fanSpeed = value;
          }
          catch(error) {
            this.errorLogging(error, this.fanService, this.fanService.getCharacteristic(Characteristic.RotationSpeed), this.fanSpeed);
            if (this.connected == false) {
              throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
            }
          }
        }
      )

    this.ThermostatService = new Service.Thermostat(this.name + " Thermostat");
    this.ThermostatService
      .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .onGet (
        async () => {
          try {
            let response = await this.client.readHoldingRegisters(this.rotorRelayActiveRegister, 1)

            if (response.data[0] != this.currentHeatingCoolingState) {
              this.log.debug("Received updated currentHeatingCoolingState from unit. Changing from %s to %s.", this.currentHeatingCoolingState, response.data[0]);
            }
            this.currentHeatingCoolingState = response.data[0];
            return this.currentHeatingCoolingState;
          }
          catch(error) {
            this.errorLogging(error, this.ThermostatService, this.ThermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState), this.currentHeatingCoolingState);
            if (this.connected == false) {
              throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
            }
            return this.currentHeatingCoolingState;
          }
        }
      )
    this.ThermostatService
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .onGet(
        async () => {
          try {
            let response = await this.client.readHoldingRegisters(this.temperatureSetPointLevelRegister, 1)

            const respondedtargetHeatingCoolingState = (response.data[0] == 0) ? 0 : 1;
            if (respondedtargetHeatingCoolingState != this.targetHeatingCoolingState) {
              this.log("Received updated targetHeatingCoolingState from unit. Changing from %s to %s.", this.targetHeatingCoolingState, respondedtargetHeatingCoolingState);
            }
            this.targetHeatingCoolingState = respondedtargetHeatingCoolingState
            return this.targetHeatingCoolingState;
          }
          catch(error) {
            this.errorLogging(error, this.ThermostatService, this.ThermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState), this.targetHeatingCoolingState);
            if (this.connected == false) {
              throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
            }
            return this.targetHeatingCoolingState;
          }
        }
      )
      .onSet(
        async (value) => {
          const targetHeatingTemperature = (value == 0) ? value : this.setPoint;
          this.log("Setting targetHeatingCoolingState %s.", this.targetHeatingCoolingState);
          try {
            let response = await this.client.writeRegisters(this.temperatureSetPointLevelRegister, [targetHeatingTemperature])

            this.targetHeatingCoolingState = value;
          }
          catch(error) {
            this.errorLogging(error, this.ThermostatService, this.ThermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState), this.targetHeatingCoolingState);
            if (this.connected == false) {
              throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
            }
          }
        }
      )
    this.ThermostatService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(
        async () => {
          try {
            let response = await this.client.readHoldingRegisters(this.currentTemperatureRegister, 1)

            let receivedData = response.data[0]
            if (receivedData > 32767) {
              receivedData = receivedData - 65535;
            }
            let receivedCurrentTemperature = receivedData / this.temperatureScaling
            if (this.currentTemperature != receivedCurrentTemperature) {
              this.log.debug("Received updated currentTemperature from unit. Changing from %s to %s.", this.currentTemperature, receivedCurrentTemperature);
            }
            this.currentTemperature = receivedCurrentTemperature;
            return this.currentTemperature;
          }
          catch(error) {
            this.errorLogging(error, this.ThermostatService, this.ThermostatService.getCharacteristic(Characteristic.CurrentTemperature), this.currentTemperature);
            if (this.connected == false) {
              throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
            }
            return this.currentTemperature;
          }
        }
      )
    this.ThermostatService
      .getCharacteristic(Characteristic.TargetTemperature)
      .onGet(
        async () => {
          try {
            let response = await this.client.readHoldingRegisters(this.temperatureSetPointRegister, 1)

            let receivedTargetTemperature = response.data[0] / this.temperatureScaling
            if (this.targetTemperature != receivedTargetTemperature) {
              this.log("Received updated targetTemperature from unit. Changing from %s to %s.", this.targetTemperature, receivedTargetTemperature);
            }
            this.targetTemperature = receivedTargetTemperature;
            return this.targetTemperature;
          }
          catch(error) {
            this.errorLogging(error, this.ThermostatService, this.ThermostatService.getCharacteristic(Characteristic.TargetTemperature), this.targetTemperature);
            if (this.connected == false) {
              throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
            }
            return this.targetTemperature;
          }
        }
      )
      .onSet(
        async (value) => {
          this.setPoint = value - this.setPointLevelDifference;
          this.log("Setting targetTemperature %s", value);
          try {
            let response = await this.client.writeRegisters(this.temperatureSetPointLevelRegister, [this.setPoint])

            this.targetTemperature = value;
          }
          catch(error) {
            this.errorLogging(error, this.ThermostatService, this.ThermostatService.getCharacteristic(Characteristic.TargetTemperature), this.targetTemperature);
            if (this.connected == false) {
              throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
            }
          }
        }
      )
    this.ThermostatService
      .getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .onGet(
        async () => {
          return this.temperatureDisplayUnits;
        }
      )
      .onSet(
        async (value) => {
          this.temperatureDisplayUnits = value;
        }
      )
    this.ThermostatService
      .getCharacteristic(Characteristic.Name)
      .onGet(
        async () => {
          return this.name;
        }
      )
    this.ThermostatService.getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({minValue: -60});
    this.ThermostatService.getCharacteristic(Characteristic.TargetTemperature)
      .setProps(this.targetTemperatureProperties);
    this.ThermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .setProps(this.targetHeatingCoolingStateValidValues);

    this.pollCharacteristics.push(this.filterMaintenanceService.getCharacteristic(Characteristic.FilterChangeIndication));
    this.pollCharacteristics.push(this.fanService.getCharacteristic(Characteristic.Active));
    this.pollCharacteristics.push(this.fanService.getCharacteristic(Characteristic.RotationSpeed));
    this.pollCharacteristics.push(this.ThermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState));
    this.pollCharacteristics.push(this.ThermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState));
    this.pollCharacteristics.push(this.ThermostatService.getCharacteristic(Characteristic.CurrentTemperature));
    this.pollCharacteristics.push(this.ThermostatService.getCharacteristic(Characteristic.TargetTemperature));

    this.runModbus();

    return [this.informationService, this.filterMaintenanceService, this.fanService, this.ThermostatService];
  }
};