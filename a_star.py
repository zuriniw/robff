# Copyright Pololu Corporation.  For more information, see https://www.pololu.com/
import smbus
import struct
import time

class AStar:
  def __init__(self):
    self.bus = smbus.SMBus(1)

  def read_unpack(self, address, size, format):
    # Ideally we could do this:
    #    byte_list = self.bus.read_i2c_block_data(20, address, size)
    # But the AVR's TWI module can't handle a quick write->read transition,
    # since the STOP interrupt will occasionally happen after the START
    # condition, and the TWI module is disabled until the interrupt can
    # be processed.
    #
    # A delay of 0.0001 (100 us) after each write is enough to account
    # for the worst-case situation in our example code.

    self.bus.write_byte(20, address)
    time.sleep(0.0001)
    byte_list = [self.bus.read_byte(20) for _ in range(size)]
    return struct.unpack(format, bytes(byte_list))

  def write_pack(self, address, format, *data):
    data_array = list(struct.pack(format, *data))
    self.bus.write_i2c_block_data(20, address, data_array)
    time.sleep(0.0001)

  def leds(self, red, yellow, green):
    self.write_pack(0, 'BBB', red, yellow, green)

  def play_notes(self, notes):
    self.write_pack(24, 'B14s', 1, notes.encode("ascii"))

  def motors(self, left, right):
    self.write_pack(6, 'hh', left, right)

  def read_buttons(self):
    return self.read_unpack(3, 3, "???")

  def read_battery_millivolts(self):
    return self.read_unpack(10, 2, "H")

  def read_analog(self):
    return self.read_unpack(12, 12, "HHHHHH")

  def read_encoders(self):
    return self.read_unpack(39, 4, 'hh')

  def test_read8(self):
    self.read_unpack(0, 8, 'cccccccc')

  def test_write8(self):
    self.bus.write_i2c_block_data(20, 0, [0,0,0,0,0,0,0,0])
    time.sleep(0.0001)

  # ========== SERVO CONTROL METHODS ==========
  
  # Servo position constants
  SERVO_NONE = 0
  SERVO_HOME = 1
  SERVO_HOLD = 2
  SERVO_LIFT = 3
  SERVO_GRIP = 4
  SERVO_CAPTURE = 5
  
  def servo_enable(self, enable=True):
    """Enable or disable servo control"""
    # Address 43 based on Arduino Data struct layout
    self.write_pack(43, 'B', int(enable))
    time.sleep(0.1)  # Give time for servos to attach
  
  def servo_disable(self):
    """Disable servo control"""
    self.servo_enable(False)
  
  def servo_set_position(self, position):
    """Set servo to predefined position (0-5)"""
    # Address 42 based on Arduino Data struct layout  
    self.write_pack(42, 'B', position)
    time.sleep(0.1)
  
  def servo_home(self):
    """Move to home position (mid, flat, open)"""
    self.servo_enable(True)
    self.servo_set_position(self.SERVO_HOME)
  
  def servo_hold(self):
    """Move to hold position (mid, flat, close)"""
    self.servo_enable(True)
    self.servo_set_position(self.SERVO_HOLD)
  
  def servo_lift(self):
    """Move to lift position (up, up, close)"""
    self.servo_enable(True)
    self.servo_set_position(self.SERVO_LIFT)
  
  def servo_grip(self):
    """Move to grip position (down, down, close)"""
    self.servo_enable(True)
    self.servo_set_position(self.SERVO_GRIP)
  
  def servo_capture(self):
    """Move to capture position (down, down, open)"""
    self.servo_enable(True)
    self.servo_set_position(self.SERVO_CAPTURE)
  
  def servo_park(self):
    """Park servos - move to home then disable"""
    self.servo_home()
    time.sleep(2)  # Wait for movement to complete
    self.servo_disable()
  
  def read_servo_status(self):
    """Read servo enable status and current position"""
    try:
      # Read servoPosition (address 42) and servoEnable (address 43)
      data = self.read_unpack(42, 2, 'BB')
      return {
        'position': data[0],
        'enabled': bool(data[1])
      }
    except:
      return {'position': 0, 'enabled': False}