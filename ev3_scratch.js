// EV3 ScratchX Plugin
// Copyright 2015 Ken Aspeslagh @massivevector
// Only tested on Mac. On Mac, ev3 brick must be named starting with "serial" if the plugin is to recognize it.
// Rename the brick before pairing it with the Mac or else the name gets cached and the serial port will have the old name
// My bricks are named serialBrick1 (etc)
// Turn off the iPod/iPhone/iPad checkbox on the EV3 Bluetooth settings after pairing or else it will not work at all

function timeStamp()
{
    return (new Date).toISOString().replace(/z|t/gi,' ').trim();
}

// scratchX is loading our javascript file again each time a saved SBX file is opened.
// JavaScript is weird and this causes our object to be reloaded and re-registered.
// Prevent this using global variable theEV3Device and EV3Connected that will only initialize to null the first time they are declared.
// This fixes a Windows bug where it would not reconnect.
var DEBUG_NO_EV3 = false;
var theEV3Device = theEV3Device || null;
var EV3ScratchAlreadyLoaded = EV3ScratchAlreadyLoaded || false;
var EV3Connected = EV3Connected || false;
var potentialEV3Devices = potentialEV3Devices || [];

var waitingCallbacks = waitingCallbacks || [[],[],[],[],[],[],[],[], []];
var waitingQueries = waitingQueries || [];
var global_sensor_result = global_sensor_result || [0, 0, 0, 0, 0, 0, 0, 0, 0];
var global_sensor_queried = global_sensor_queried || [0, 0, 0, 0, 0, 0, 0, 0, 0];

var connecting = connecting || false;
var notifyConnection = notifyConnection|| false;
var potentialDevices = potentialDevices || []; // copy of the list
var warnedAboutBattery = warnedAboutBattery || false;
var deviceTimeout = deviceTimeout || 0;
var counter = counter || 0;
var poller = poller || null;
var pingTimeout = pingTimeout || null;
var connectionTimeout = connectionTimeout || null;

var waitingForPing = waitingForPing || false;
var waitingForInitialConnection = waitingForInitialConnection || false;


(function(ext) {
  // Cleanup function when the extension is unloaded

  ext._getStatus = function()
  {
      if (!EV3Connected)
        return { status:1, msg:'Disconnected' };
      else
        return { status:2, msg:'Connected' };
  };
  
  ext._deviceRemoved = function(dev)
  {
    console.log(timeStamp() +' Device removed');
    // Not currently implemented with serial devices
  };

  
 
  ext._deviceConnected = function(dev)
  {
      console.log(timeStamp() + '_deviceConnected: ' + dev.id);
      if (EV3Connected)
      {
        console.log("Already EV3Connected. Ignoring");
      }
      // brick's serial port must be named like tty.serialBrick7-SerialPort
      // this is how 10.10 is naming it automatically, the brick name being serialBrick7
      // the Scratch plugin is only letting us know about serial ports with names that
      // "begin with tty.usbmodem, tty.serial, or tty.usbserial" - according to khanning
      
      if ((dev.id.indexOf('/dev/tty.serial') === 0 && dev.id.indexOf('-SerialPort') != -1) || dev.id.indexOf('COM') === 0)
      {

        if (potentialEV3Devices.filter(function(e) { return e.id == dev.id; }).length == 0) {
              potentialEV3Devices.push(dev); }
 
          if (!deviceTimeout)
            deviceTimeout = setTimeout(tryAllDevices, 1000);
      }
  };
 
 function tryAllDevices()
 {
    potentialDevices = potentialEV3Devices.slice(0);
    // start recursive loop
    tryNextDevice();
 }

 function clearSensorStatuses()
 {
     var numSensorBlocks = 9;
     waitingQueries = [];
     for (x = 0; x < numSensorBlocks; x++)
     {
        waitingCallbacks[x] = [];
        global_sensor_result[x] = 0;
        global_sensor_queried[x] = 0;
     }
 }
 

function tryToConnect()
{
    clearSensorStatuses();
    counter = 0; 
    
    theEV3Device.open({ stopBits: 0, bitRate: 57600 /*115200*/, ctsFlowControl: 0}); //, parity:2, bufferSize:255 });
    console.log(timeStamp() + ': Attempting connection with ' + theEV3Device.id);
    theEV3Device.set_receive_handler(receive_handler);
 
    connecting = true;
    testTheConnection(startupBatteryCheckCallback);
    waitingForInitialConnection = true;
    connectionTimeout = setTimeout(connectionTimeOutCallback, 5000);
}

function startupBatteryCheckCallback(result)
{
   console.log(timeStamp() + ": got battery level at connect: " + result);
 
   waitingForInitialConnection = false;

   EV3Connected = true;
   connecting = false;
   
   playStartUpTones();
 
     if (result < 11 && !warnedAboutBattery)
     {
       alert("Your battery is getting low.");
       warnedAboutBattery = true;
     }
 
    // setupWatchdog();
 
     if (deferredCommandArray)
     {
        var tempCommand = deferredCommandArray;
        deferredCommandArray = null;
        window.setTimeout(function() {
                  sendCommand(tempCommand);
                   }, 2500);
     }
}

function setupWatchdog()
{
    if (poller)
        clearInterval(poller);

   poller = setInterval(pingBatteryWatchdog, 10000);
}

function pingBatteryWatchdog()
{
    console.log(timeStamp() + ": pingBatteryWatchdog");
    testTheConnection(pingBatteryCheckCallback);
    waitingForPing = true;
    pingTimeout = setTimeout(pingTimeOutCallback, 3000);
}

function pingTimeOutCallback()
{
   if (waitingForPing == true)
   {
     console.log(timeStamp() + ": Ping timed out");
      if (poller)
        clearInterval(poller);
      
      EV3Connected = false;
      
    //    alert("The connection to the brick was lost. Check your brick and refresh the page to reconnect. (Don't forget to save your project first!)");
      /* if (r == true) {
         reconnect();
        } else {
         // do nothing
        }
        */
   }
 }

function connectionTimeOutCallback()
{
   if (waitingForInitialConnection == true)
   {
     console.log(timeStamp() + ": Initial connection timed out");
     connecting = false;
 
     if (potentialDevices.length == 0)
     {
        console.log(timeStamp() + ": Tried all devices with no luck.");
 
     //  alert("Failed to connect to a brick.\n\nMake sure your brick is:\n 1) powered on with Bluetooth On\n 2) named starting with serial (if on a Mac)\n 3) paired with this computer\n 4) the iPhone/iPad/iPod check box is NOT checked\n 5) Do not start a connection to or from the brick in any other way. Let the Scratch plug-in handle it!\n\nand then try reloading the webpage.");
       /*  if (r == true) {
         reconnect();
         } else {
         // do nothing
        }
        */
        theEV3Device = null;
    }
    else
    {
        tryNextDevice();
    }
   }
 }

function pingBatteryCheckCallback(result)
{
   console.log(timeStamp() + ": pinged battery level: " + result);
   if (pingTimeout)
    clearTimeout(pingTimeout);
   waitingForPing = false;
 
   if (result < 11 && !warnedAboutBattery)
   {
     alert("Your battery is getting low.");
     warnedAboutBattery = true;
   }
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
                       }, tonedelay+150);
     
     window.setTimeout(function() {
                          playFreqM2M(523, 100);
                       }, tonedelay+300);
 }
 
  function tryNextDevice()
  {
    potentialDevices.sort((function(a, b){return b.id.localeCompare(a.id)}));

    console.log("devices: " + potentialDevices);
    var device = potentialDevices.shift();
    if (!device)
        return;
 
    theEV3Device = device;
 
    if (!DEBUG_NO_EV3)
    {
        tryToConnect();
    }
  }
  
  ext._shutdown = function()
  {
    console.log(timeStamp() +' SHUTDOWN: ' + ((theEV3Device) ? theEV3Device.id : "null"));

//    if (poller)
  //      clearInterval(poller);

/*
    if (theEV3Device)
        theEV3Device.close();
    if (poller)
        clearInterval(poller);
    EV3Connected = false;
    theEV3Device = null;
 */
 
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
  


  function receive_handler(data)
  {
    var inputData = new Uint8Array(data);
    console.log(timeStamp() + " received: " + createHexString(inputData));

    if (!(EV3Connected || connecting))
      return;
  
    var query_info = waitingQueries.shift();
    if (!query_info)
        return;
 
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
    }
    
    else if (mode == IR_SENSOR)
    {
        if (modeType == IR_PROX)
            theResult = getFloatResult(inputData);
        else if (modeType == IR_REMOTE)
            theResult = getIRButtonNameForCode(getFloatResult(inputData));
    }
    else if (mode == GYRO_SENSOR)
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
 
    global_sensor_result[this_is_from_port] = theResult;
    global_sensor_queried[this_is_from_port]--;
    while(callback = waitingCallbacks[this_is_from_port].shift())
    {
        console.log(timeStamp() + " result: " + theResult);
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

 function getIRButtonNameForCode(inButtonCode)
 {
     for (var i = 0; i < IRbuttonCodes.length; i++)
     {
         if (inButtonCode == IRbuttonCodes[i])
        {
            return IRbuttonNames[i];
         }
     }
    return "";
 }

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
  
     console.log(timeStamp() + " sending: " + createHexString(mess));

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
    // nonsensical unsigned byte packing. see cOutputPackParam in c_output-c in EV3 firmware
    var a = new ArrayBuffer(4);
    var sarr = new Int8Array(a);
    var uarr = new Uint8Array(a);
  
    sarr[0] = num & 0x000000FF;
    sarr[1] = (num >> 8) & 0x000000FF;
    sarr[2] = (num >> 16) & 0x000000FF;
    sarr[3] = (num >> 24) & 0x000000FF;

    if (lc == 0)
    {
        var bits = uarr[0];
        bits &= 0x0000003F;
        return hexcouplet(bits);
    }
    else if (lc == 1)
    {
      return "81" + hexcouplet(uarr[0]);
    }
    else if (lc == 2)
    {
        return "82" + hexcouplet(uarr[0]) + hexcouplet(uarr[1]);
    }
    else if (lc == 3)
    {
        return "83" + hexcouplet(uarr[0]) + hexcouplet(uarr[1]) + hexcouplet(uarr[2]) + hexcouplet(uarr[3]);
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
  var SET_MOTOR_STEP_SPEED = "AC00";
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
  var ULTRSONIC_DC_INCH = "06";

  var GYRO_SENSOR = "20";
  var GYRO_ANGLE = "00";
  var GYRO_RATE = "01";
  var GYRO_FAST = "02";
  var GYRO_RATE_AND_ANGLE = "03";
  var GYRO_CALIBRATION = "04";
  var IR_SENSOR = "21";
  var IR_PROX = "00";
  var IR_SEEKER = "01";
  var IR_REMOTE = "02"
  var IR_REMOTE_ADVANCE = "03";
  var IR_CALIBRATION = "05";
  var REFLECTED_INTENSITY = "00";
  var AMBIENT_INTENSITY = "01";
  var COLOR_VALUE = "02";
  var COLOR_RAW_RGB = "04";
  var READ_FROM_MOTOR = "FOOBAR";
 
 
  var deferredCommandArray = null;
 
  function sendCommand(commandArray)
  {
    if ((EV3Connected || connecting) && theEV3Device)
    {
        theEV3Device.send(commandArray.buffer);
    }
    else
    {
       deferredCommandArray = commandArray;
       if (theEV3Device && !connecting)
       {
         tryToConnect(); // try to connect
       }
       else if (!connecting)
       {
         tryAllDevices(); // try device list again
       }
 
    }
  }
  
  ext.startMotors = function(which, speed)
  {
    clearDriveTimer();

    console.log("motor " + which + " speed: " + speed);
  
    motor(which, speed);
  }
 
 function capSpeed(speed)
 {
    if (speed > 100) { speed = 100; }
    if (speed < -100) { speed = -100; }
    return speed;
  }
 
 ext.motorDegrees = function(which, speed, degrees, howStop)
 {
     speed = capSpeed(speed);

   var motorBitField = getMotorBitsHexString(which);
   var speedBits = getPackedOutputHexString(speed, 1);
   var stepRampUpBits = getPackedOutputHexString(0, 3);
   var stepConstantBits = getPackedOutputHexString(degrees, 3);
   var stepRampDownBits = getPackedOutputHexString(0, 3);
   var howHex = howStopHex(howStop);
   
   var motorsCommand = createMessage(DIRECT_COMMAND_PREFIX + SET_MOTOR_STEP_SPEED + motorBitField + speedBits
                                     + stepRampUpBits + stepConstantBits + stepRampDownBits + howHex
                                     + SET_MOTOR_START + motorBitField);
 
   sendCommand(motorsCommand);
 }
 
  function motor(which, speed)
  {
      speed = capSpeed(speed);
     var motorBitField = getMotorBitsHexString(which);
     
     var speedBits = getPackedOutputHexString(speed, 1);
     
     var motorsOnCommand = createMessage(DIRECT_COMMAND_PREFIX + SET_MOTOR_SPEED + motorBitField + speedBits + SET_MOTOR_START + motorBitField);
     
     sendCommand(motorsOnCommand);
  }

  function motor2(which, speed)
  {
      speed = capSpeed(speed);
      var p =  which.split("+");
 
     var motorBitField1 = getMotorBitsHexString(p[0]);
     var motorBitField2 = getMotorBitsHexString(p[1]);
     var motorBitField = getMotorBitsHexString(which);
 
     var speedBits1 = getPackedOutputHexString(speed, 1);
     var speedBits2 = getPackedOutputHexString(speed * -1, 1);
 
     var motorsOnCommand = createMessage(DIRECT_COMMAND_PREFIX
                                         + SET_MOTOR_SPEED + motorBitField1 + speedBits1
                                         + SET_MOTOR_SPEED + motorBitField2 + speedBits2
                                         
                                         + SET_MOTOR_START + motorBitField);
     
     sendCommand(motorsOnCommand);
  }


  var frequencies = { "C4" : 262, "D4" : 294, "E4" : 330, "F4" : 349, "G4" : 392, "A4" : 440, "B4" : 494, "C5" : 523, "D5" : 587, "E5" : 659, "F5" : 698, "G5" : 784, "A5" : 880, "B5" : 988, "C6" : 1047, "D6" : 1175, "E6" : 1319, "F6" : 1397, "G6" : 1568, "A6" : 1760, "B6" : 1976, "C#4" : 277, "D#4" : 311, "F#4" : 370, "G#4" : 415, "A#4" : 466, "C#5" : 554, "D#5" : 622, "F#5" : 740, "G#5" : 831, "A#5" : 932, "C#6" : 1109, "D#6" : 1245, "F#6" : 1480, "G#6" : 1661, "A#6" : 1865 };
  
 var colors = [ "none", "black", "blue", "green", "yellow", "red", "white"];
 
 var IRbuttonNames = ['Top Left', 'Bottom Left', 'Top Right', 'Bottom Right', 'Top Bar'];
 var IRbuttonCodes = [1,            2,              3,          4,              9];
 
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
 
function howStopHex(how)
{
    if (how == 'break')
        return '01';
    else
        return '00';
}
                                                                            
  function motorsStop(how)
  {
      console.log("motorsStop");

      var motorBitField = getMotorBitsHexString("all");

      var howHex = howStopHex(how);
      
      var motorsOffCommand = createMessage(DIRECT_COMMAND_PREFIX + SET_MOTOR_STOP + motorBitField + howHex);
      
      sendCommand(motorsOffCommand);
  }
  
  function sendNOP()
  {
     var nopCommand = createMessage(DIRECT_COMMAND_PREFIX + NOOP);
  }

  ext.steeringControl = function(ports, what, duration, callback)
  {
    clearDriveTimer();
    var defaultSpeed = 50;
    if (what == 'forward')
    {
        motor(ports, defaultSpeed);
    }
    else if (what == 'reverse')
    {
        motor(ports, -1 * defaultSpeed);
    }
     else if (what == 'right')
     {
       motor2(ports, defaultSpeed);
     }
     else if (what == 'left')
     {
       motor2(ports, -1 * defaultSpeed);
     }
    driveCallback = callback;
    driveTimer = window.setTimeout(function()
    {
        if (duration > 0) // allow zero duration to run motors asynchronously
        {
          motorsStop('coast');
        }
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
 
 function readIRRemoteSensor(portInt)
 {
    if (global_sensor_queried[portInt] == 0)
    {
        global_sensor_queried[portInt]++;
        readFromSensor2(portInt, IR_SENSOR, IR_REMOTE);
    }
 }
 
  ext.whenButtonPressed = function(port)
  {
    if (!theEV3Device || !EV3Connected)
        return false;
    var portInt = parseInt(port) - 1;
    readTouchSensor(portInt);
    return global_sensor_result[portInt];
  }

 ext.whenRemoteButtonPressed = function(IRbutton, port)
 {
     if (!theEV3Device || !EV3Connected)
        return false;
 
     var portInt = parseInt(port) - 1;
     readIRRemoteSensor(portInt);
 
     return (global_sensor_result[portInt] == IRbutton);
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

    readFromColorSensor(portInt, modeCode);
  }
 
 function readFromColorSensor(portInt, modeCode)
 {
     if (global_sensor_queried[portInt] == 0)
     {
        global_sensor_queried[portInt]++;
        readFromSensor2(portInt, COLOR_SENSOR, modeCode);
     }
 }
 
 var lineCheckingInterval = 0;

 ext.waitUntilDarkLinePort = function(port, callback)
 {
    if (lineCheckingInterval)
        clearInterval(lineCheckingInterval);
    lineCheckingInterval = 0;
    var modeCode = REFLECTED_INTENSITY;
    var portInt = parseInt(port) - 1;
    global_sensor_result[portInt] = -1;
 
    lineCheckingInterval = window.setInterval(function()
    {
        readFromColorSensor(portInt, modeCode);
         if (global_sensor_result[portInt] < 25 && global_sensor_result[portInt] >= 0)    // darkness or just not reflection (air)
         {
                clearInterval(lineCheckingInterval);
                lineCheckingInterval = 0;
                callback();
         }
    }, 5);
 }
 
  ext.readGyroPort = function(mode, port, callback)
  {
    var modeCode = GYRO_ANGLE;
    if (mode == 'rate') { modeCode = GYRO_RATE; }
 
    var portInt = parseInt(port) - 1;
 
    waitingCallbacks[portInt].push(callback);
    if (global_sensor_queried[portInt] == 0)
    {
      global_sensor_queried[portInt]++;
      readFromSensor2(portInt, GYRO_SENSOR, modeCode);
    }
  }
 
  ext.readDistanceSensorPort = function(port, callback)
  {
    var portInt = parseInt(port) - 1;

    waitingCallbacks[portInt].push(callback);
    if (global_sensor_queried[portInt] == 0)
    {
      global_sensor_queried[portInt]++;
      readFromSensor2(portInt, IR_SENSOR, IR_PROX);
    }
  }
  
  ext.readRemoteButtonPort = function(port, callback)
  {
    var portInt = parseInt(port) - 1;

    waitingCallbacks[portInt].push(callback);
 
    readIRRemoteSensor(portInt);
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
 
 // this routine is awful similar to readFromSensor2...
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
    tryAllDevices();
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
           [' ', 'start motor %m.whichMotorPort speed %n',              'startMotors',      'B+C', 100],
           [' ', 'rotate motor %m.whichMotorPort speed %n by %n degrees then %m.breakCoast',              'motorDegrees',      'A', 100, 360, 'break'],
           [' ', 'stop all motors %m.breakCoast',                       'allMotorsOff',     'break'],
           ['h', 'when button pressed on port %m.whichInputPort',       'whenButtonPressed','1'],
           ['h', 'when IR remote %m.buttons pressed port %m.whichInputPort', 'whenRemoteButtonPressed','Top Left', '1'],
           ['R', 'button pressed %m.whichInputPort',                    'readTouchSensorPort',   '1'],
           ['w', 'play note %m.note duration %n ms',                    'playTone',         'C5', 500],
           ['w', 'play frequency %n duration %n ms',                    'playFreq',         '262', 500],
           ['R', 'light sensor %m.whichInputPort %m.lightSensorMode',   'readColorSensorPort',   '1', 'color'],
       //    ['w', 'wait until light sensor %m.whichInputPort detects black line',   'waitUntilDarkLinePort',   '1'],
           ['R', 'measure distance %m.whichInputPort',                  'readDistanceSensorPort',   '1'],
           ['R', 'remote button %m.whichInputPort',                     'readRemoteButtonPort',   '1'],
          // ['R', 'gyro  %m.gyroMode %m.whichInputPort',                 'readGyroPort',  'angle', '1'],
           ['R', 'motor %m.motorInputMode %m.whichMotorIndividual',     'readFromMotor',   'position', 'B'],

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
  gyroMode: ['angle', 'rate'],
  note:["C4","D4","E4","F4","G4","A4","B4","C5","D5","E5","F5","G5","A5","B5","C6","D6","E6","F6","G6","A6","B6","C#4","D#4","F#4","G#4","A#4","C#5","D#5","F#5","G#5","A#5","C#6","D#6","F#6","G#6","A#6"],
  whichInputPort: ['1', '2', '3', '4'],
  buttons: IRbuttonNames,
    },
  };

   var serial_info = {type: 'serial'};
   ScratchExtensions.register('EV3 Control', descriptor, ext, serial_info);
   console.log(timeStamp() + ' registered extension. theEV3Device:' + theEV3Device);
 
 console.log("EV3ScratchAlreadyLoaded: " + EV3ScratchAlreadyLoaded);
 EV3ScratchAlreadyLoaded = true;
 })({});

