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
  this.pollInterval = config.pollInterval

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
  this.targetTemperatureProperties = config.targetTemperatureProperties || {"minValue": 12, "maxValue": 22, "minStep": 1};
  this.targetHeatingCoolingStateValidValues = {"validValues": [0, 1]};

  this.filterChangeIndication = 0;

  this.on = true;
  this.fanLevel = 2;
  this.fanSpeed = 67;

  this.targetTemperature = 20;
  this.setPointLevelDifference = this.targetTemperatureProperties.minValue - 1;
  this.setPoint = this.targetTemperature - this.setPointLevelDifference;
  this.currentTemperature = 20;
  this.targetHeatingCoolingState = 1;

  this.client = new ModbusRTU();
  this.client.connectTCP(this.host, {
    port: this.port
  });
  this.client.setID(this.slave);

  this.pollCharacteristics = [];
}

Ventilation.prototype = {

  identify: function(callback) {
    this.log("Identify requested!");
    callback();
  },

  getFilterChangeIndication: function(callback) {
    this.client.readHoldingRegisters(this.replacementTimeInMonthsRegister, 1)
      .then((responseMonths) => {
        this.replacementTimeMonths = responseMonths.data[0];
        this.client.readHoldingRegisters(this.elapsedDaysSinceFilterChangeRegister, 1)
          .then((responseDays) => {

            (responseDays.data[0] > this.replacementTimeMonths * 30) ? this.filterChangeIndication = 1 : this.filterChangeIndication = 0;

            this.log("Get filterChangeIndication: %s based on number of days passed: %s", this.filterChangeIndication, responseDays.data[0]);
            callback(null, this.filterChangeIndication)
          })
          .catch(callback)
      })
      .catch(callback);
  },

  getFanOn: function(callback) {
    this.client.readHoldingRegisters(this.fanSpeedLevelRegister, 1)
      .then((response) => {

        (response.data[0] == 0) ? this.on = false : this.on = true;

        this.log("Get on: %s", this.on);
        callback(null, this.on)
      })
      .catch(callback);
  },

  setFanOn: function(value, callback) {

    const targetFanLevel = (value == true) ? this.fanLevel : 0;
    this.client.writeRegisters(this.fanSpeedLevelRegister, [targetFanLevel])
      .then((response) => {
        this.log("Set on: %s and fanLevel: %s", value, targetFanLevel);
        this.on = value;
        callback();
      })
      .catch(callback)
  },

  getFanRotationSpeed: function(callback) {
    this.client.readHoldingRegisters(this.fanSpeedLevelRegister, 1)
      .then((response) => {

        switch (true) {
          case ( response.data[0] == 0):
            this.fanSpeed = 0;
            break;
          case ( response.data[0] == 1):
            this.fanSpeed = 33;
            break;
          case ( response.data[0] == 2):
            this.fanSpeed = 67;
            break;
          default:
            this.fanSpeed = 100;
            break;
        }

        this.log("Get rotationSpeed: %s", this.fanSpeed);
        callback(null, this.fanSpeed)
      })
      .catch(callback);
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
        this.log("Set RotationSpeed: %s as fanLevel: %s", value, this.fanLevel);
        callback();
      })
      .catch(callback)
  },

  getCurrentHeatingCoolingState: function(callback) {
    this.client.readHoldingRegisters(this.rotorRelayActiveRegister, 1)
      .then((response) => {
        this.currentHeatingCoolingState = response.data[0];
        this.log("Get currentHeatingCoolingState: %s", this.currentHeatingCoolingState);
        callback(null, this.currentHeatingCoolingState)
      })
      .catch(callback);
  },

  getTargetHeatingCoolingState: function(callback) {
    this.client.readHoldingRegisters(this.temperatureSetPointLevelRegister, 1)
      .then((response) => {
        (response.data[0] == 0) ? this.targetHeatingCoolingState = 0 : this.targetHeatingCoolingState = 1;
        this.log("Get targetHeatingCoolingState: %s", this.targetHeatingCoolingState);
        callback(null, this.targetHeatingCoolingState)
      })
      .catch(callback);
  },

  setTargetHeatingCoolingState: function(value, callback) {
    const targetHeatingTemperature = (value == 0) ? value : this.setPoint;

    this.client.writeRegisters(this.temperatureSetPointLevelRegister, [targetHeatingTemperature])
      .then((response) => {
        this.targetHeatingCoolingState = value;
        this.log("Set targetHeatingCoolingState: %s", this.targetHeatingCoolingState);
        callback();
      })
      .catch(callback);
  },

  getCurrentTemperature: function(callback) {
    this.client.readHoldingRegisters(this.supplyAirTemperatureRegister, 1)
      .then((response) => {
        this.currentTemperature = response.data[0] * this.temperatureScaling;
        this.log("Get currentTemperature: %s", this.currentTemperature);
        callback(null, this.currentTemperature)
      })
      .catch(callback);
  },

  getTargetTemperature: function(callback) {
    this.client.readHoldingRegisters(this.temperatureSetPointRegister, 1)
      .then((response) => {
        this.targetTemperature = response.data[0] * this.temperatureScaling;
        this.log("Get targetTemperature: %s", this.targetTemperature);
        callback(null, this.targetTemperature)
      })
      .catch(callback);
  },

  setTargetTemperature: function(value, callback) {
    this.setPoint = value - this.setPointLevelDifference;
    this.client.writeRegisters(this.temperatureSetPointLevelRegister, [this.setPoint])
      .then((response) => {
        this.targetTemperature = value;
        this.log("Set targetTemperature: %s", value);
        callback()
      })
      .catch(callback);
  },

  getTemperatureDisplayUnits: function(callback) {
    this.log("getTemperatureDisplayUnits:", this.temperatureDisplayUnits);
    callback(null, this.temperatureDisplayUnits);
  },

  setTemperatureDisplayUnits: function(value, callback) {
    this.log("setTemperatureDisplayUnits from %s to %s", this.temperatureDisplayUnits, value);
    this.temperatureDisplayUnits = value;
    callback();
  },

  getName: function(callback) {
    this.log("getName :", this.name);
    callback(null, this.name);
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

    if (this.pollInterval) {
      this.pollCharacteristics.push(this.filterMaintenanceService.getCharacteristic(Characteristic.FilterChangeIndication));
      this.pollCharacteristics.push(this.fanService.getCharacteristic(Characteristic.On));
      this.pollCharacteristics.push(this.fanService.getCharacteristic(Characteristic.RotationSpeed));
      this.pollCharacteristics.push(this.ThermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState));
      this.pollCharacteristics.push(this.ThermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState));
      this.pollCharacteristics.push(this.ThermostatService.getCharacteristic(Characteristic.CurrentTemperature));
      this.pollCharacteristics.push(this.ThermostatService.getCharacteristic(Characteristic.TargetTemperature));

      setInterval(() => {
        this.pollCharacteristics.forEach((characteristic) => characteristic.getValue());
      }, this.pollInterval * 1000);
    }

    return [this.informationService, this.filterMaintenanceService, this.fanService, this.ThermostatService];
  }
};
