
import requests 
import time
from threading import Timer

class EV3(object):
	def __init__(self):
		self.handlers = {}
		self.sensors = {}
		self._timer     = None
		self.interval   = 0.1
		self.is_running = False
		self.startPolling()

	def startPolling(self):
		if not self.is_running:
			self._timer = Timer(self.interval, self._poll)
			self._timer.start()
			self.is_running = True

	def _poll(self):
		self.is_running = False
		self.startPolling()
		self.doPoll()

	def doPoll(self):
		result = self.request('poll')
		for line in result.splitlines():
			if not line.startswith("_"):
				sense, sensed = line.split()
				self.sensors[sense] = sensed
				if sense in self.handlers:
					if sense.startswith("readTouchSensorPort/"):
						if sensed == "true":
							self.handlers[sense]()
					elif sense.startswith("readRemoteButtonPort/"):
						self.handlers[sense](sensed)

	def drive(self, motor, what, t):
		self.command('steeringControl',  [motor, what, t])
		time.sleep(t + 0.05)


	def startMotors(self, motor, speed):
		self.command('startMotors', [motor, speed])


	def rotateMotor(self, motor, speed, degrees, doWhatWhenDone):
		self.command('motorDegrees',  [motor, speed, degrees, doWhatWhenDone])
		time.sleep(0.05)

	def stopMotors(self, motor, doWhatWhenDone):
		self.command('motorsStop', [motor, doWhatWhenDone])

	def setLED(self, pattern):
		self.command('setLED', [pattern])

	def playNote(self, note, dur):
		self.command('playTone', [note, dur])
		time.sleep((dur/1000.0) + 0.05)

	def playFrequency(self, freq, dur):
		self.command('playFreq', [freq, dur])
		time.sleep((dur/1000.0) + 0.05)	

	def onButtonPressed(self, port, callback):
		self.handlers["readTouchSensorPort" + "/" + str(port)] = callback

	def onRemoteButtonPressed(self, port, callback):
		self.command('setIRMode', "remote control" )
		self.handlers["readRemoteButtonPort" + "/" + str(port)] = callback

	def buttonPressed(self, port):
		touchPort = "readTouchSensorPort" + "/" + str(port)
		if touchPort in self.sensors:
			if self.sensors[touchPort] == "true":
				return True
			else:
				return False
		else:
			return False

	def remoteButtonPressed(self, port):
		touchPort = "readRemoteButtonPort" + "/" + str(port)
		if touchPort in self.sensors:
			return self.sensors[touchPort]
		else:
			return ""
			
	def lightSensor(self, port, mode):
		touchPort = "readColorSensorPort" + "/" + str(port)
		self.command('theLightSensorMode', mode)
		if touchPort in self.sensors:
			return self.sensors[touchPort]
		else:
			return ""

	def measureDistance(self, port):
		touchPort = "readDistanceSensorPort" + "/" + str(port)
		self.command('setIRMode', "measure distance")
		if touchPort in self.sensors:
			return float(self.sensors[touchPort])
		else:
			return 0

	def motorPosition(self, port, mode):
		touchPort = "readMotorPosition" + "/" + str(port)
		self.command('theMotorMode', mode)
		if touchPort in self.sensors:
			return float(self.sensors[touchPort])
		else:
			return 0

	def command(self, what, parts):
		newparts = [what]
		for part in parts:
			newparts.append(str(part))
		path = "/".join(newparts)

		return self.request(path)

	def request(self, req):	
		try:
			r = requests.get('http://localhost:12347/' + req)

			return r.text
		except:
			return ""