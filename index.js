var Service, Characteristic;
var ModbusRTU = require("modbus-serial");

module.exports = function (homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory("homebridge-systemair-modbus", "systemairModbus", Ventilation);
};

function Ventilation(log, config) {
	this.log = log;

	this.name = config.name;
	this.manufacturer = config.manufacturer || 'Systemair';
	this.model = config.model || 'VTR300';
	this.serial = config.serial || 'SN1';

	this.host = config.host || "10.0.0.153";
	this.port = config.port || 8234;
	this.slave = config.slave || 10;
	this.temperatureDisplayUnits = config.temperatureDisplayUnits || 0;

	
	this.active = 1;
	this.fanLevel = 2;
	this.fanSpeed = 67;

	this.targetTemperature = 20;
	this.currentTemperature = 20;
	this.targetHeatingCoolingState = 1;

	this.client = new ModbusRTU();
	this.client.connectTCP(this.host, { port: this.port });
	this.client.setID(this.slave);
}

Ventilation.prototype = {

	identify: function (callback) {
		this.log("Identify requested!");
		callback();
	},

	getActive: function (callback) {
		this.client.readHoldingRegisters(100, 1)
		.then((response) => {
			this.log("Raw active: %s", response.data[0]);

			if (response.data[0] == 0) {
				this.active = 0
			} else {
				this.active = 1
			}

			this.log("Get active: %s", this.active);
			callback(null, this.active)
		})
		.catch(callback);
	},

	setActive: function (value, callback) {
		if (value == 1) {
			this.client.writeRegisters(100, [this.fanLevel]);
			this.log("Set active: %s and fanLevel: %s", value, this.fanLevel);
		} else {
			this.client.writeRegisters(100, [value]);
			this.log("Set active: %s", value);
		}
		callback();
	},

	getRotationSpeed: function (callback) {
		this.client.readHoldingRegisters(100, 1)
		.then((response) => {
			this.log("Raw rotationSpeed: %s", response.data[0]);

			switch(true) {
				case (response.data[0] == 0):
					this.fanSpeed = 0;
					break;
				case (response.data[0] == 1):
					this.fanSpeed = 33;
					break;
				case (response.data[0] == 2):
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

	setRotationSpeed: function (value, callback) {

		switch(true) {
			case (value == 0):
				this.fanLevel = 0;
				break;
			case (value < 34):
				this.fanLevel = 1;
				break;
			case (value < 68):
				this.fanLevel = 2;
				break;
			default:
				this.fanLevel = 3;
				break;
		}

		this.client.writeRegisters(100, [this.fanLevel]);
		this.log("Set RotationSpeed: %s", value);
		callback();
	},

	getCurrentHeatingCoolingState: function (callback) {
		this.client.readHoldingRegisters(351, 1)
			.then((response) => {
				this.currentHeatingCoolingState = response.data[0];
				this.log("Get currentHeatingCoolingState: %s", this.currentHeatingCoolingState);
				callback(null, this.currentHeatingCoolingState)
			})
			.catch(callback);
	},

	getTargetHeatingCoolingState: function (callback) {
		this.log("Get targetHeatingCoolingState: %s", this.targetHeatingCoolingState);
		callback(null, this.targetHeatingCoolingState);
	},

	setTargetHeatingCoolingState: function (value, callback) {
		this.log("Set targetHeatingCoolingState from %s to %s", this.targetHeatingCoolingState, value);
		this.targetHeatingCoolingState = value;
		callback();
	},

	getCurrentTemperature: function (callback) {
		this.client.readHoldingRegisters(213, 1)
		.then((response) => {
			this.currentTemperature = response.data[0] / 10;
			this.log("Get currentTemperature: %s", this.currentTemperature);
			callback(null, this.currentTemperature)
		})
		.catch(callback);
	},

	getTargetTemperature: function (callback) {
		this.client.readHoldingRegisters(207, 1)
		.then((response) => {
			this.targetTemperature = response.data[0] / 10;
			this.log("Get targetTemperature: %s", this.targetTemperature);
			callback(null, this.targetTemperature)
		})
		.catch(callback);
	},

	setTargetTemperature: function (value, callback) {
		let setPoint = value - 11;
		this.client.writeRegisters(206, [setPoint]);
		this.targetTemperature = value;
		this.log("Set targetTemperature: %s", value);
		callback();
	},

	getTemperatureDisplayUnits: function (callback) {
		this.log("getTemperatureDisplayUnits:", this.temperatureDisplayUnits);
		callback(null, this.temperatureDisplayUnits);
	},

	setTemperatureDisplayUnits: function (value, callback) {
		this.log("setTemperatureDisplayUnits from %s to %s", this.temperatureDisplayUnits, value);
		this.temperatureDisplayUnits = value;
		callback();
	},

	getName: function (callback) {
		this.log("getName :", this.name);
		callback(null, this.name);
	},

	getServices: function () {

		this.informationService = new Service.AccessoryInformation();
		this.informationService
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.model)
			.setCharacteristic(Characteristic.SerialNumber, this.serial);

		this.fanService = new Service.Fan(this.name);
        this.fanService
            .getCharacteristic(Characteristic.Active)
            .on('get', this.getActive.bind(this))
            .on('set', this.setActive.bind(this));
        this.fanService
            .addCharacteristic(Characteristic.RotationSpeed)
            .on('get', this.getRotationSpeed.bind(this))
            .on('set', this.setRotationSpeed.bind(this));

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
			.setProps({
				minValue: 11,
				maxValue: 22,
				minStep: 1
			});
		this.ThermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
			.setProps({
				validValues: [1]
			});

		return [this.informationService, this.fanService, this.ThermostatService];
	}
};
