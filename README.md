# homebridge-systemair-modbus
This is a plugin for [Homebridge](https://github.com/nfarina/homebridge). It
implements a Systemair Villavent VTR300 unit connected via Modbus TCP as a HomeKit accessory and exposes the following services:

- Thermostat
- Fan
- Filter Maintenance

## Installation

1. Install [homebridge](https://github.com/nfarina/homebridge#installation-details)
2. Install this plugin: `npm install -g homebridge-systemair-modbus`
3. Update your `config.json` file (See below).

## Configuration example

```json
"accessories": [
  {
    "accessory": "systemairModbus", //Required. Do not change.
    "host": "10.0.0.153", //Required. IP-address of the TCP to Modbus-interface.
    "port": 8234, //Required. Port of the TCP to Modbus-interface.
    "slave": 10, //Required. Slave address of the unit.
    "pollInterval": 5, //Optional. Polling interval in seconds. 
    "name": "Ventilation", //Optional. Name of accessory.
    "model": "VTR300", //Optional. Model of the unit.
    "serial": "SN1", //Optional. Serial Number of the unit.
    "temperatureDisplayUnits": 0, //Optional, 0 for Celcius and 1 for Fahrenheit.
    "replacementTimeInMonthsRegister": 600, //Optional. Needs to correspond with the unit's Modbus implementation.
    "elapsedDaysSinceFilterChangeRegister": 601, //Optional. Needs to correspond with the unit's Modbus implementation.
    "fanSpeedLevelRegister": 100, //Optional. Needs to correspond with the unit's Modbus implementation.
    "rotorRelayActiveRegister": 351, //Optional. Needs to correspond with the unit's Modbus implementation.
    "temperatureSetPointLevelRegister": 206, //Optional. Needs to correspond with the unit's Modbus implementation.
    "temperatureSetPointRegister": 207, //Optional. Needs to correspond with the unit's Modbus implementation.
    "supplyAirTemperatureRegister": 213, //Optional. Needs to correspond with the unit's Modbus implementation.
    "temperatureScaling": 10, //Optional. Needs to correspond with the unit's Modbus implementation.
    "targetTemperatureProperties": {"minValue": 12, "maxValue": 22, "minStep": 1} //Optional. Needs to correspond with the unit's Modbus implementation.
  }
]
```