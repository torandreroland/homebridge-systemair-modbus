var Service, Characteristic;
var ModbusRTU = require("modbus-serial");

module.exports = function(homebridge){
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("homebridge-modbus-thermostat", "systemairModbus", Thermostat);
};

function Thermostat(log, config) {
	this.log = log;

  this.name = config.name;
  this.manufacturer = config.manufacturer || 'Systemair';
  this.model = config.model || 'VTR300';
  this.serial = config.serial || 'SN1';

  this.host = config.host ||  "10.0.0.153";
  this.port = config.port || 8234;
  this.slave = config.slave || 10;

  this.temperatureDisplayUnits = config.temperatureDisplayUnits || 0;
	this.maxTemp = config.maxTemp || 11;
  this.minTemp = config.minTemp || 22;
  this.minStep = config.minStep || 1;
  this.targetTemperature = 20;
	this.currentTemperature = 20;
  this.targetHeatingCoolingState = 1;
  this.heatingCoolingState = 1;
  this.heatingCoolingValidValues = [1];

  var client = new ModbusRTU();
  client.connectTCP(this.host, { port: this.port });
  client.setID(this.slave);

	this.service = new Service.Thermostat(this.name);
}

Thermostat.prototype = {

	identify: function(callback) {
		this.log("Identify requested!");
		callback();
	},

	getCurrentHeatingCoolingState: function(callback) {
    this.currentHeatingCoolingState = client.readHoldingRegisters(351, 1);
    this.log("currentHeatingCoolingState: %s", this.currentHeatingCoolingState);
    callback(null, this.currentHeatingCoolingState);
  },
  
  getTargetHeatingCoolingState: function(callback) {
		this.log("getTargetHeatingCoolingState: %s", this.targetHeatingCoolingState);
		callback(null, this.targetHeatingCoolingState);
  },

  setTargetHeatingCoolingState: function(value, callback) {
		this.log("setTargetHeatingCoolingState from %s to %s", this.targetHeatingCoolingState, value);
		this.targetHeatingCoolingState = value;
		callback();
  },

  getCurrentTemperature: function(callback) {
    this.currentTemperature = client.readHoldingRegisters(213, 1) / 10;
    this.log("currentTemperature: %s", this.currentTemperature);
    callback(null, this.currentTemperature);
  },

  getTargetTemperature: function(callback) {
    this.targetTemperature = client.readHoldingRegisters(207, 1) / 10;
    this.log("targetTemperature: %s", this.targetTemperature);
    callback(null, this.targetTemperature);
  },

  setTargetTemperature: function(value, callback) {
    let setPoint = value - 11;
    client.writeRegisters(206, [setPoint]);
    this.targetTemperature = value;
    this.log("targetTemperature: %s", this.value);
    callback(null, this.targetTemperature);
  },

	getTemperatureDisplayUnits: function(callback) {
		//this.log("getTemperatureDisplayUnits:", this.temperatureDisplayUnits);
		callback(null, this.temperatureDisplayUnits);
	},

  setTemperatureDisplayUnits: function(value, callback) {
		this.log("[*] setTemperatureDisplayUnits from %s to %s", this.temperatureDisplayUnits, value);
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

		this.service
			.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
			.on('get', this.getCurrentHeatingCoolingState.bind(this));

		this.service
			.getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .setProps({ this.heatingCoolingValidValues })
			.on('get', this.getTargetHeatingCoolingState.bind(this))
			.on('set', this.setTargetHeatingCoolingState.bind(this));

		this.service
			.getCharacteristic(Characteristic.CurrentTemperature)
			.on('get', this.getCurrentTemperature.bind(this));

		this.service
			.getCharacteristic(Characteristic.TargetTemperature)
			.on('get', this.getTargetTemperature.bind(this))
			.on('set', this.setTargetTemperature.bind(this));

		this.service
			.getCharacteristic(Characteristic.TemperatureDisplayUnits)
			.on('get', this.getTemperatureDisplayUnits.bind(this))
      .on('set', this.setTemperatureDisplayUnits.bind(this));

		this.service
			.getCharacteristic(Characteristic.Name)
			.on('get', this.getName.bind(this));

		this.service.getCharacteristic(Characteristic.CurrentTemperature)
			.setProps({
				minStep: this.minStep
			});

		this.service.getCharacteristic(Characteristic.TargetTemperature)
			.setProps({
				minValue: this.minTemp,
				maxValue: this.maxTemp,
				minStep: this.minStep
			});
		return [this.informationService, this.service];
	}
};
