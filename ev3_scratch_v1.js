// EV3 ScratchX Plugin
// Copyright 2015 Ken Aspeslagh @massivevector
// Only tested on Mac. On Mac, ev3 brick must be named starting with "serial" if the plugin is to recognize it.
// Rename the brick before pairing it with the Mac or else the name gets cached and the serial port will have the old name
// My bricks are named serialBrick1 (etc)
// Turn off the iPod/iPhone/iPad checkbox on the EV3 Bluetooth settings after pairing or else it will not work at all

(function(ext) {
  // Cleanup function when the extension is unloaded
  ext._shutdown = function() {};
  
  ext._getStatus = function()
  {
      if (!connected)
        return { status:1, msg:'Disconnected' };
      else
        return { status:2, msg:'Connected' };
  };
  
  ext._deviceRemoved = function(dev)
  {
    console.log('Device removed');
    // Not currently implemented with serial devices
  };

  
  var connected = false;
  var connecting = false;
  var notifyConnection = false;
  var device = null;
  
  var potentialDevices = [];
  ext._deviceConnected = function(dev) {
  
  //console.log('_deviceConnected: ' + dev.id);

  // brick's serial port must be named like tty.serialBrick7-SerialPort
  // this is how 10.10 is naming it automatically, the brick name being serialBrick7
  // the Scratch plugin is only letting us know about serial ports with names that
  // "begin with tty.usbmodem, tty.serial, or tty.usbserial" - according to khanning
  
  if (dev.id.indexOf('/dev/tty.serialBrick') === 0 && dev.id.indexOf('-SerialPort') != -1)
  {
      potentialDevices.push(dev);
      if (!device)
          tryNextDevice();
  }
  };
  
  var poller = null;
  var pingTimeout = null;
  var waitingForPing = false;

  var DEBUG_NO_EV3 = false;
  var theDevice = null;
 
function reconnect()
 {
    theDevice.open({ stopBits: 0, bitRate: 115200, ctsFlowControl: 0, parity:2, bufferSize:255 });
    console.log('Attempting connection with ' + theDevice.id);
    theDevice.set_receive_handler(receive_handler);
 
    connecting = true;
    testTheConnection(startupBatteryCheckCallback);
}

function startupBatteryCheckCallback(result)
{
   console.log("got battery level at connect: " + result);
   
   connected = true;
   connecting = false;
   
   playStartUpTones();
   
   setupWatchdog();
}

function setupWatchdog()
{
    if (poller)
        clearInterval(poller);

   poller = setInterval(pingBatteryWatchdog, 5000);
}

function pingBatteryWatchdog()
{
    testTheConnection(pingBatteryCheckCallback);
    waitingForPing = true;
    pingTimeout = setTimeout(pingTimeOutCallback, 1000);
}

function pingTimeOutCallback()
{
   if (waitingForPing == true)
   {
     console.log("Ping timed out!");
      if (poller)
        clearInterval(poller);
      
      connected = false;
   }
}

function pingBatteryCheckCallback(result)
{
   console.log("pinged battery level: " + result);
   if (pingTimeout)
    clearTimeout(pingTimeout);
   waitingForPing = false;
}


function testTheConnection(theCallback)
{
   window.setTimeout(function() {
                          readThatBatteryLevel(theCallback);
                       }, 500);
 }

function playStartUpTones()
{
    var tonedelay = 1000;
    window.setTimeout(function() {
                          playFreqM2M(262, 100);
                       }, tonedelay);

     window.setTimeout(function() {
                          playFreqM2M(392, 100);
                       }, tonedelay+100);
     
     window.setTimeout(function() {
                          playFreqM2M(523, 100);
                       }, tonedelay+200);
 }
 
  function tryNextDevice()
  {
    device = potentialDevices.shift();
    if (!device)
        return;
 
   theDevice = device;
 
  if (!DEBUG_NO_EV3)
  {
    reconnect();
  }
      /*
      watchdog = setTimeout(function() {
                            clearInterval(poller);
                            poller = null;
                            device.set_receive_handler(null);
                            device.close();
                            device = null;
                            tryNextDevice();
                            }, 5000);
       */
  }
  
  ext._shutdown = function()
  {
    if (device && connected)
        device.close();
    if (poller)
        clearInterval(poller);

    device = null;
  };
  
  // create hex string from bytes
  function createHexString(arr)
  {
      var result = "";
      for (i in arr)
      {
          var str = arr[i].toString(16);
          str = str.toUpperCase();
          str = str.length == 0 ? "00" :
          str.length == 1 ? "0" + str :
          str.length == 2 ? str :
          str.substring(str.length-2, str.length);
          result += str;
        }
        return result;
  }
  
  var waitingCallbacks = [[],[],[],[],[],[],[],[], []];
  var waitingQueries = [];
  var global_touch_pressed = [false, false, false, false,false, false, false, false, false];
  var global_sensor_queried = [0, 0, 0, 0, 0, 0, 0, 0, 0];

  function receive_handler(data)
  {
    var inputData = new Uint8Array(data);
    console.log("received: " + createHexString(inputData));
  
    var query_info = waitingQueries.shift();
    var this_is_from_port = query_info[0];
    var mode = query_info[1];
    var modeType = query_info[2];
     
    var theResult = "";

    if (mode == TOUCH_SENSOR)
    {
        var result = inputData[5];
        theResult = (result == 100);
    }
    else if (mode == COLOR_SENSOR)
    {
        var num = Math.floor(getFloatResult(inputData));
        if (modeType == AMBIENT_INTENSITY || modeType == REFLECTED_INTENSITY)
        {
            theResult = num;
        }
        else if (modeType == COLOR_VALUE)
        {
            if (num >= 0 && num < 7)
                theResult = colors[num];
            else
                theResult = "none";
        }
 /*
        else if (modeType == COLOR_RAW_RGB)  // is color_raw encoded as a string, hex, or number?
        {
            theResult = num; //maybe? probably not, but here's hoping it's this simple.
        }
  */
    }
    
    else if (mode == IR_SENSOR)
    {
        theResult = getFloatResult(inputData);
    }
    else if (mode == READ_FROM_MOTOR)
    {
        theResult = getFloatResult(inputData);
    }
    else if (mode == UIREAD)
    {
        if (modeType == UIREAD_BATTERY)
        {
            theResult = inputData[5];
        }
     }
 
    global_touch_pressed[this_is_from_port] = theResult;
    global_sensor_queried[this_is_from_port]--;
    while(callback = waitingCallbacks[this_is_from_port].shift())
    {
        callback(theResult);
    }
  }

 function getFloatResult(inputData)
 {
     var a = new ArrayBuffer(4);
     var c = new Float32Array(a);
     var arr = new Uint8Array(a);
     arr[0] = inputData[5];
     arr[1] = inputData[6];
     arr[2] = inputData[7]
     arr[3] = inputData[8]
     return c[0];
 }
 
  var counter = 0;
 
  // add counter and byte length encoding prefix. return Uint8Array of final message
  function createMessage(str)
  {
//console.log("message: " + str);
  
      var length = ((str.length / 2) + 2);

      var a = new ArrayBuffer(4);
      var c = new Uint16Array(a);
      var arr = new Uint8Array(a);
      c[1] = counter;
      c[0] = length;
      counter++;
      var mess = new Uint8Array((str.length / 2) + 4);
      
      for (var i = 0; i < 4; i ++)
      {
        mess[i] = arr[i];
      }
  
      for (var i = 0; i < str.length; i += 2)
      {
        mess[(i / 2) + 4] = window.parseInt(str.substr(i, 2), 16);
      }
  
     console.log("sending: " + createHexString(mess));

      return mess;
  }
  
  // motor port bit field from menu choice string
  function getMotorBitsHexString(which)
  {
     if (which == "A")
        return "01";
    else if (which == "B")
        return "02";
    else if (which == "C")
        return "04";
    else if (which == "D")
        return "08";
    else if (which == "B+C")
        return "06";
    else if (which == "A+D")
        return "09";
    else if (which == "all")
        return "0F";

    return "00";
  }

 function getMotorIndex(which)
 {
     if (which == "A")
        return 4;
     else if (which == "B")
        return 5;
     else if (which == "C")
        return 6;
     else if (which == "D")
        return 7;
 }

  // create 8 bit hex couplet
  function hexcouplet(num)
  {
    var str = num.toString(16);
    str = str.toUpperCase();
    if (str.length == 1)
    {
      return "0" + str;
    }
    return str;
  }
  
  // int bytes using weird serialization method
  function getPackedOutputHexString(num, lc)
  {
    // f-ed up nonsensical unsigned bit packing. see cOutputPackParam in c_output-c in EV3 firmware
    var a = new ArrayBuffer(2);
    var sarr = new Int8Array(a);
    var uarr = new Uint8Array(a);
  
    sarr[0] = num & 0x000000FF;
    sarr[1] = (num >> 8) & 0x000000FF;

    if (lc == 0) //power < 32 && power > -32)
    {
        var powerbits = uarr[0];
        powerbits &= 0x0000003F;
        return hexcouplet(powerbits);
    }
    else if (lc == 1) //(power < 127 && power > -127)
    {
      return "81" + hexcouplet(uarr[0]);
    }
    else if (lc == 2) //(power < 32767 && power > 32767)
    {
        return "82" + hexcouplet(uarr[0]) + hexcouplet(uarr[1]);
    }

    return "00";
  }
  
  var DIRECT_COMMAND_PREFIX = "800000";
  var DIRECT_COMMAND_REPLY_PREFIX = "000100";
  var DIRECT_COMMAND_REPLY_SENSOR_PREFIX = "000400";
  var DIRECT_COMMAND_REPLY_MOTOR_PREFIX = "000500";
  // direct command opcode/prefixes
  var SET_MOTOR_SPEED = "A400";
  var SET_MOTOR_STOP = "A300";
  var SET_MOTOR_START = "A600";
  var NOOP = "0201";
  var PLAYTONE = "9401";
  var INPUT_DEVICE_READY_SI = "991D";
  var READ_SENSOR = "9A00";
  var UIREAD  = "81"; // opUI_READ
  var UIREAD_BATTERY = "12"; // GET_LBATT
 
  var mode0 = "00";
  var TOUCH_SENSOR = "10";
  var COLOR_SENSOR = "1D";
  var ULTRASONIC_SENSOR = "1E";
  var ULTRSONIC_CM = "00";
  var ULTRSONIC_INCH = "01";
  var ULTRSONIC_LISTEN = "02";
  var ULTRSONIC_SI_CM = "03";
  var ULTRSONIC_SI_INCH = "04";
  var ULTRSONIC_DC_CM = "05"; 
  var ULTRSONIC_DC_INCH = "06"; //I'm just putting this in for the sake of knowing I didn't miss any.
  var WHY_IS_THERE_A_GAP_HERE = "1F"; //Just so I don't think I'm missing one 
  var GYRO_SENSOR = "20";
  var GYRO_ANGLE = "00";
  var GYRO_RATE = "01";
  var GYRO_FAST = "02"; //very descriptive, LEGO firmware writers
  var GYRO_RATE_AND_ANGLE = "03"; //I kid you not, this is a real thing. WHYYYY?
  var GYRO_CALIBRATION = "04";
  var IR_SENSOR = "21";
  var IR_PROX = "00";
  var IR_SEEKER = "01";
  var IR_REMOTE = "02"
  var IR_REMOTE_ADVANCE = "03"; //I have no clue what this is.
  var IR_CALIBRATION = "05"; //Yep, no clue what some of these do. I don't think many, if any people do.
  var REFLECTED_INTENSITY = "00";
  var AMBIENT_INTENSITY = "01";
  var COLOR_VALUE = "02";
  var COLOR_RAW_RGB = "04";
  var READ_FROM_MOTOR = "FOOBAR";
 
  
  function sendCommand(commandArray)
  {
    if ((connected || connecting) && device)
        device.send(commandArray.buffer);
  }
  
  ext.allMotorsOn = function(which, power)
  {
    clearDriveTimer();

   console.log("motor " + which + " power: " + power);
  
    motor(which, power);
  }
  
  function motor(which, power)
  {
    var motorBitField = getMotorBitsHexString(which);

    var powerBits = getPackedOutputHexString(power, 1);

    var motorsOnCommand = createMessage(DIRECT_COMMAND_PREFIX + SET_MOTOR_SPEED + motorBitField + powerBits + SET_MOTOR_START + motorBitField);
  
    sendCommand(motorsOnCommand);
  }

  
  var frequencies = { "C4" : 262, "D4" : 294, "E4" : 330, "F4" : 349, "G4" : 392, "A4" : 440, "B4" : 494, "C5" : 523, "D5" : 587, "E5" : 659, "F5" : 698, "G5" : 784, "A5" : 880, "B5" : 988, "C6" : 1047, "D6" : 1175, "E6" : 1319, "F6" : 1397, "G6" : 1568, "A6" : 1760, "B6" : 1976, "C#4" : 277, "D#4" : 311, "F#4" : 370, "G#4" : 415, "A#4" : 466, "C#5" : 554, "D#5" : 622, "F#5" : 740, "G#5" : 831, "A#5" : 932, "C#6" : 1109, "D#6" : 1245, "F#6" : 1480, "G#6" : 1661, "A#6" : 1865 };
  
 var colors = [ "none", "black", "blue", "green", "yellow", "red", "white"];
 
  ext.playTone = function(tone, duration, callback)
  {
      var freq = frequencies[tone];
      console.log("playTone " + tone + " duration: " + duration + " freq: " + freq);
      var volume = 100;
      var volString = getPackedOutputHexString(volume, 1);
      var freqString = getPackedOutputHexString(freq, 2);
      var durString = getPackedOutputHexString(duration, 2);
      
      var toneCommand = createMessage(DIRECT_COMMAND_PREFIX + PLAYTONE + volString + freqString + durString);

      sendCommand(toneCommand);
  
       window.setTimeout(function() {
                    driveTimer = 0;
                    callback();
                    }, duration);
  }
 
 
 ext.playFreq = function(freq, duration, callback)
 {
     console.log("playFreq duration: " + duration + " freq: " + freq);
     var volume = 100;
     var volString = getPackedOutputHexString(volume, 1);
     var freqString = getPackedOutputHexString(freq, 2);
     var durString = getPackedOutputHexString(duration, 2);
     
     var toneCommand = createMessage(DIRECT_COMMAND_PREFIX + PLAYTONE + volString + freqString + durString);
     
     sendCommand(toneCommand);
     
     window.setTimeout(function() {
                       driveTimer = 0;
                       callback();
                       }, duration);
 }
 
function playFreqM2M(freq, duration)
 {
     console.log("playFreqM2M duration: " + duration + " freq: " + freq);
     var volume = 100;
     var volString = getPackedOutputHexString(volume, 1);
     var freqString = getPackedOutputHexString(freq, 2);
     var durString = getPackedOutputHexString(duration, 2);
     
     var toneCommand = createMessage(DIRECT_COMMAND_PREFIX + PLAYTONE + volString + freqString + durString);
     
     sendCommand(toneCommand);
  
 }
 
 function clearDriveTimer()
 {
    if (driveTimer)
        clearInterval(driveTimer);
    driveTimer = 0;
    if (driveCallback)
        driveCallback();
    driveCallback = 0;
}
 
  ext.allMotorsOff = function(how)
  {
      clearDriveTimer();
      motorsStop(how);
  }
 
 var driveTimer = 0;
 driveCallback = 0;
 
  function motorsStop(how)
  {
      console.log("motorsStop");

      var motorBitField = getMotorBitsHexString("all");

      var howHex = '00';
      if (how == 'break')
         howHex = '01';
      
      var motorsOffCommand = createMessage(DIRECT_COMMAND_PREFIX + SET_MOTOR_STOP + motorBitField + howHex);
      
      sendCommand(motorsOffCommand);
  }

  ext.steeringControl = function(ports, what, duration, callback)
  {
    clearDriveTimer();
    var defaultPower = 50;
    if (what == 'forward')
    {
        motor(ports, defaultPower);
    }
    else if (what == 'reverse')
    {
        motor(ports, -1 * defaultPower);
    }
    else
    {
        var p =  ports.split("+");
        if (what == 'left')
        {
            motor(p[0], -1 * defaultPower);
            motor(p[1],  defaultPower);
        }
        else if (what == 'right')
         {
         motor(p[1], -1 * defaultPower);
         motor(p[0],  defaultPower);
         }
    }
    driveCallback = callback;
    driveTimer = window.setTimeout(function()
    {
        motorsStop('coast');
        callback();
    } , duration*1000);
  }
 
  function readTouchSensor(portInt)
  {
     if (global_sensor_queried[portInt] == 0)
     {
       global_sensor_queried[portInt]++;
       readFromSensor(portInt, TOUCH_SENSOR, mode0);
     }
  }
 
  ext.whenButtonPressed = function(port)
  {
    if (!device || !connected)
        return false;
    var portInt = parseInt(port) - 1;
    readTouchSensor(portInt);
    return global_touch_pressed[portInt];
  }
  
  ext.readTouchSensorPort = function(port, callback)
  {
    var portInt = parseInt(port) - 1;

    waitingCallbacks[portInt].push(callback);
    readTouchSensor(portInt);
  }
 
  ext.readColorSensorPort = function(port, mode, callback)
  {
    var modeCode = AMBIENT_INTENSITY;
    if (mode == 'reflected') { modeCode = REFLECTED_INTENSITY; }
    if (mode == 'color') { modeCode = COLOR_VALUE; }
    if (mode == 'RGBcolor') { modeCode = COLOR_RAW_RGB; }
 
    var portInt = parseInt(port) - 1;

    waitingCallbacks[portInt].push(callback);
    if (global_sensor_queried[portInt] == 0)
    {
      global_sensor_queried[portInt]++;
      readFromSensor2(portInt, COLOR_SENSOR, modeCode);
    }
  }
 
  ext.readDistanceSensorPort = function(port, callback)
  {
    var portInt = parseInt(port) - 1;

    waitingCallbacks[portInt].push(callback);
    if (global_sensor_queried[portInt] == 0)
    {
      global_sensor_queried[portInt]++;
      readFromSensor2(portInt, IR_SENSOR, mode0);
    }
  }
 
  function readFromSensor(port, type, mode)
  {

      waitingQueries.push([port, type, mode]);

      var readCommand = createMessage(DIRECT_COMMAND_REPLY_PREFIX +
                                           READ_SENSOR +
                                           hexcouplet(port) +
                                           type +
                                            mode + "60");

      sendCommand(readCommand);
  }

 function readFromSensor2(port, type, mode)
 {
    waitingQueries.push([port, type, mode]);
 
    var readCommand = createMessage(DIRECT_COMMAND_REPLY_SENSOR_PREFIX +
                                 INPUT_DEVICE_READY_SI + "00" + // layer
                                 hexcouplet(port) + "00" + // type
                                 mode +
                                 "0160"); // result stuff
 
    sendCommand(readCommand);
 }
 
 ext.readFromMotor = function(mmode, which, callback)
 {
    var portInt = getMotorIndex(which);
    var mode = "01"; // position
    if (mmode == 'speed')
        mode = "02";
     waitingCallbacks[portInt].push(callback);
     if (global_sensor_queried[portInt] == 0)
     {
        global_sensor_queried[portInt]++;
        readFromAMotor(portInt, READ_FROM_MOTOR, mode);
     }
 }
 
 function readFromAMotor(port, type, mode)
 {
 
    waitingQueries.push([port, type, mode]);
 
    var readCommand = createMessage(DIRECT_COMMAND_REPLY_SENSOR_PREFIX +
                                 INPUT_DEVICE_READY_SI + "00" + // layer
                                 hexcouplet(port+12) + "00" + // type
                                 mode +
                                 "0160"); // result stuff
    sendCommand(readCommand);
 }

 ext.readBatteryLevel = function(callback)
 {
   readThatBatteryLevel(callback);
 }
 
 function readThatBatteryLevel(callback)
 {
    var portInt = 8; // bogus port number
     waitingCallbacks[portInt].push(callback);
     if (global_sensor_queried[portInt] == 0)
     {
        global_sensor_queried[portInt]++;
        UIRead(portInt, UIREAD_BATTERY);
     }
 }
 
 ext.reconnectToDevice = function()
 {
    reconnect();
 }
 
 function UIRead(port, subtype)
 {
    waitingQueries.push([port, UIREAD, subtype]);
 
    var readCommand = createMessage(DIRECT_COMMAND_REPLY_PREFIX +
                                 UIREAD + subtype +
                                 "60"); // result stuff
    sendCommand(readCommand);
 }
 
  // Block and block menu descriptions
  var descriptor = {
  blocks: [
           ['w', 'drive %m.dualMotors %m.turnStyle %n seconds',         'steeringControl',  'B+C', 'forward', 3],
           [' ', 'start motor %m.whichMotorPort speed %n',                    'allMotorsOn',      'B+C', 100],
           [' ', 'stop all motors %m.breakCoast',                       'allMotorsOff',     'break'],
           ['h', 'when button pressed %m.whichInputPort',               'whenButtonPressed','1'],
           ['R', 'button pressed %m.whichInputPort',                    'readTouchSensorPort',   '1'],
           ['w', 'play note %m.note duration %n ms',                    'playTone',         'C5', 500],
           ['w', 'play frequency %n duration %n ms',                    'playFreq',         '262', 500],
           ['R', 'light sensor %m.whichInputPort %m.lightSensorMode',   'readColorSensorPort',   '1', 'color'],
           ['R', 'measure distance %m.whichInputPort',   'readDistanceSensorPort',   '1'],
           ['R', 'motor %m.motorInputMode %m.whichMotorIndividual',   'readFromMotor',   'position', 'B'],

       //    ['R', 'battery level',   'readBatteryLevel'],
         //  [' ', 'reconnect', 'reconnectToDevice'],
           ],
  menus: {
  whichMotorPort:   ['A', 'B', 'C', 'D', 'A+D', 'B+C'],
  whichMotorIndividual:   ['A', 'B', 'C', 'D'],
  dualMotors:       ['A+D', 'B+C'],
  turnStyle:        ['forward', 'reverse', 'right', 'left'],
  breakCoast:       ['break', 'coast'],
  lightSensorMode:  ['reflected', 'ambient', 'color'],
 motorInputMode: ['position', 'speed'],
  note:["C4","D4","E4","F4","G4","A4","B4","C5","D5","E5","F5","G5","A5","B5","C6","D6","E6","F6","G6","A6","B6","C#4","D#4","F#4","G#4","A#4","C#5","D#5","F#5","G#5","A#5","C#6","D#6","F#6","G#6","A#6"],
  whichInputPort: ['1', '2', '3', '4'],
    },
  };

  var serial_info = {type: 'serial'};
  ScratchExtensions.register('EV3 Control', descriptor, ext, serial_info);
  console.log('registered: ');
})({});

