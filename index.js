var Service,
  Characteristic;
var ModbusRTU = require("modbus-serial");

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
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
  this.supplyAirTemperatureRegister = config.supplyAirTemperatureRegister || 213;
  this.temperatureScaling = config.temperatureScaling || 0.1;
  this.targetTemperatureProperties = config.targetTemperatureProperties || {
    "minValue": 12,
    "maxValue": 22,
    "minStep": 1
  };
  this.targetHeatingCoolingStateValidValues = {
    "validValues": [0, 1]
  };

  this.connected = false;
  this.pollCharacteristics = [];

  this.filterChangeIndication = 0;

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

  errorHandling: function(error, callback) {
    this.connected = (this.client.isOpen) ? true : false;
    if (this.connected == false) {
      this.log("Lost connection to Modbus TCP-server, reconnecting shortly...");
    }
    callback(error);
  },

  getFilterChangeIndication: function(callback) {
    this.client.readHoldingRegisters(this.replacementTimeInMonthsRegister, 1)
      .then((responseMonths) => {
        this.replacementTimeMonths = responseMonths.data[0];
        this.client.readHoldingRegisters(this.elapsedDaysSinceFilterChangeRegister, 1)
          .then((responseDays) => {
            const respondedFilterChangeIndication = (responseDays.data[0] > this.replacementTimeMonths * 30) ? 1 : 0;
            if (respondedFilterChangeIndication != this.filterChangeIndication) {
              this.log("Received updated filterChangeIndication from unit. Changing from %s to %s based on number of days passed: %s", this.filterChangeIndication, respondedFilterChangeIndication, responseDays.data[0]);
            }
            this.filterChangeIndication = respondedFilterChangeIndication;
            callback(null, this.filterChangeIndication);
          })
          .catch((error) => {
            this.errorHandling(error, callback);
          })
      })
      .catch((error) => {
            this.errorHandling(error, callback);
          })
  },

  getFanOn: function(callback) {
    this.client.readHoldingRegisters(this.fanSpeedLevelRegister, 1)
      .then((response) => {
        const respondedFanOn = (response.data[0] == 0) ? false : true;
        if (respondedFanOn != this.fanOn) {
          this.log("Received updated fanOn from unit. Changing from %s to %s", this.fanOn, respondedFanOn);
        }
        this.fanOn = respondedFanOn;
        callback(null, this.fanOn)
      })
      .catch((error) => {
            this.errorHandling(error, callback);
          })
  },

  setFanOn: function(value, callback) {
    const targetFanLevel = (value == true) ? this.fanLevel : 0;

    this.client.writeRegisters(this.fanSpeedLevelRegister, [targetFanLevel])
      .then((response) => {
        this.log("Setting fanOn %s and fanLevel %s", value, targetFanLevel);
        this.fanOn = value;
        callback();
      })
      .catch((error) => {
            this.errorHandling(error, callback);
          })
  },

  getFanRotationSpeed: function(callback) {
    this.client.readHoldingRegisters(this.fanSpeedLevelRegister, 1)
      .then((response) => {

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
          this.log("Received updated rotationSpeed from unit. Changing from %s to %s", this.fanSpeed, respondedFanSpeed);
        }
        this.fanSpeed = respondedFanSpeed
        callback(null, this.fanSpeed)
      })
      .catch((error) => {
            this.errorHandling(error, callback);
          })
  },

  setFanRotationSpeed: function(value, callback) {

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

    this.client.writeRegisters(this.fanSpeedLevelRegister, [this.fanLevel])
      .then((response) => {
        this.log("Setting rotationSpeed %s as fanLevel %s", value, this.fanLevel);
        callback();
      })
      .catch((error) => {
            this.errorHandling(error, callback);
          })
  },

  getCurrentHeatingCoolingState: function(callback) {
    this.client.readHoldingRegisters(this.rotorRelayActiveRegister, 1)
      .then((response) => {
        if (response.data[0] != this.currentHeatingCoolingState) {
          this.log("Received updated currentHeatingCoolingState from unit. Changing from %s to %s", this.currentHeatingCoolingState, response.data[0]);
        }
        this.currentHeatingCoolingState = response.data[0];
        callback(null, this.currentHeatingCoolingState)
      })
      .catch((error) => {
            this.errorHandling(error, callback);
          })
  },

  getTargetHeatingCoolingState: function(callback) {
    this.client.readHoldingRegisters(this.temperatureSetPointLevelRegister, 1)
      .then((response) => {
        const respondedtargetHeatingCoolingState = (response.data[0] == 0) ? 0 : 1;
        if (respondedtargetHeatingCoolingState != this.targetHeatingCoolingState) {
          this.log("Received updated targetHeatingCoolingState from unit. Changing from %s to %s", this.targetHeatingCoolingState, respondedtargetHeatingCoolingState);
        }
        this.targetHeatingCoolingState = respondedtargetHeatingCoolingState
        callback(null, this.targetHeatingCoolingState)
      })
      .catch((error) => {
            this.errorHandling(error, callback);
          })
  },

  setTargetHeatingCoolingState: function(value, callback) {
    const targetHeatingTemperature = (value == 0) ? value : this.setPoint;

    this.client.writeRegisters(this.temperatureSetPointLevelRegister, [targetHeatingTemperature])
      .then((response) => {
        this.targetHeatingCoolingState = value;
        this.log("Setting targetHeatingCoolingState %s", this.targetHeatingCoolingState);
        callback();
      })
      .catch((error) => {
            this.errorHandling(error, callback);
          })
  },

  getCurrentTemperature: function(callback) {
    this.client.readHoldingRegisters(this.supplyAirTemperatureRegister, 1)
      .then((response) => {
        if (this.currentTemperature != response.data[0] * this.temperatureScaling) {
          this.log("Received updated currentTemperature from unit. Changing from %s to %s", this.currentTemperature, response.data[0] * this.temperatureScaling);
        }
        this.currentTemperature = response.data[0] * this.temperatureScaling;
        callback(null, this.currentTemperature)
      })
      .catch((error) => {
            this.errorHandling(error, callback);
          })
  },

  getTargetTemperature: function(callback) {
    this.client.readHoldingRegisters(this.temperatureSetPointRegister, 1)
      .then((response) => {
        if (this.targetTemperature != response.data[0] * this.temperatureScaling) {
          this.log("Received updated targetTemperature from unit. Changing from %s to %s", this.targetTemperature, response.data[0] * this.temperatureScaling);
        }
        this.targetTemperature = response.data[0] * this.temperatureScaling;
        callback(null, this.targetTemperature)
      })
      .catch((error) => {
            this.errorHandling(error, callback);
          })
  },

  setTargetTemperature: function(value, callback) {
    this.setPoint = value - this.setPointLevelDifference;
    this.client.writeRegisters(this.temperatureSetPointLevelRegister, [this.setPoint])
      .then((response) => {
        this.targetTemperature = value;
        this.log("Setting targetTemperature %s", value);
        callback()
      })
      .catch((error) => {
            this.errorHandling(error, callback);
          })
  },

  getTemperatureDisplayUnits: function(callback) {
    callback(null, this.temperatureDisplayUnits);
  },

  setTemperatureDisplayUnits: function(value, callback) {
    this.temperatureDisplayUnits = value;
    callback();
  },

  getName: function(callback) {
    callback(null, this.name);
  },

  connectClient: function() {
    this.client = new ModbusRTU();

    let connect = function() {
      this.client.connectTCP(this.host, {
        port: this.port
      })
        .then((response) => {
          this.client.setID(this.slave);
          this.connected = true;
          this.log("Connected to Modbus TCP-server");
        })
        .catch((error) => {
          this.log(error);
        })
    };

    this.client.close(connect.bind(this));
  },

  poll: function() {
    this.pollCharacteristics.forEach((characteristic) => characteristic.getValue());
  },

  runModbus: function() {
    this.connected ? this.poll() : this.connectClient();
    setTimeout(() => this.runModbus(), this.pollInterval * 1000);
  },

  getServices: function() {

    this.informationService = new Service.AccessoryInformation();
    this.informationService
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.serial);

    this.filterMaintenanceService = new Service.FilterMaintenance(this.name);
    this.filterMaintenanceService
      .getCharacteristic(Characteristic.FilterChangeIndication)
      .on('get', this.getFilterChangeIndication.bind(this));

    this.fanService = new Service.Fan(this.name);
    this.fanService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getFanOn.bind(this))
      .on('set', this.setFanOn.bind(this));
    this.fanService
      .addCharacteristic(Characteristic.RotationSpeed)
      .on('get', this.getFanRotationSpeed.bind(this))
      .on('set', this.setFanRotationSpeed.bind(this));

    this.ThermostatService = new Service.Thermostat(this.name);
    this.ThermostatService
      .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .on('get', this.getCurrentHeatingCoolingState.bind(this));
    this.ThermostatService
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .on('get', this.getTargetHeatingCoolingState.bind(this))
      .on('set', this.setTargetHeatingCoolingState.bind(this));
    this.ThermostatService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemperature.bind(this));
    this.ThermostatService
      .getCharacteristic(Characteristic.TargetTemperature)
      .on('get', this.getTargetTemperature.bind(this))
      .on('set', this.setTargetTemperature.bind(this));
    this.ThermostatService
      .getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .on('get', this.getTemperatureDisplayUnits.bind(this))
      .on('set', this.setTemperatureDisplayUnits.bind(this));
    this.ThermostatService
      .getCharacteristic(Characteristic.Name)
      .on('get', this.getName.bind(this));
    this.ThermostatService.getCharacteristic(Characteristic.TargetTemperature)
      .setProps(this.targetTemperatureProperties);
    this.ThermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .setProps(this.targetHeatingCoolingStateValidValues);

    this.pollCharacteristics.push(this.filterMaintenanceService.getCharacteristic(Characteristic.FilterChangeIndication));
    this.pollCharacteristics.push(this.fanService.getCharacteristic(Characteristic.On));
    this.pollCharacteristics.push(this.fanService.getCharacteristic(Characteristic.RotationSpeed));
    this.pollCharacteristics.push(this.ThermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState));
    this.pollCharacteristics.push(this.ThermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState));
    this.pollCharacteristics.push(this.ThermostatService.getCharacteristic(Characteristic.CurrentTemperature));
    this.pollCharacteristics.push(this.ThermostatService.getCharacteristic(Characteristic.TargetTemperature));

    this.runModbus();

    return [this.informationService, this.filterMaintenanceService, this.fanService, this.ThermostatService];
  }
};
