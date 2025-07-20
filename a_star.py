# Copyright Pololu Corporation.  For more information, see https://www.pololu.com/
import smbus
import struct
import time

# ============================================================================
# DATA STRUCTURE REFERENCE
# ============================================================================
# struct Data
# {
#   bool yellow, green, red;           // 0, 1, 2 (3 bytes)
#   bool buttonA, buttonB, buttonC;    // 3, 4, 5 (3 bytes)
#   int16_t leftMotor, rightMotor;     // 6, 7, 8, 9 (4 bytes)
#   uint16_t batteryMillivolts;        // 10, 11 (2 bytes)
#   uint16_t analog[6];                // 12-23 (12 bytes)
#   bool playNotes;                    // 24 (1 byte)
#   char notes[14];                    // 25-38 (14 bytes)
#   int16_t leftEncoder, rightEncoder; // 39-42 (4 bytes)
#   uint8_t servoPosition;             // 43 (1 byte) 
#   bool servoEnable;                  // 44 (1 byte)
#   uint16_t liftPWM;                  // 45-46 (2 bytes)
#   uint16_t tiltPWM;                  // 47-48 (2 bytes)  
#   uint16_t gripperPWM;               // 49-50 (2 bytes)
# };

class AStar:
  def __init__(self):
    self.bus = smbus.SMBus(1)

  # ============================================================================
  # LOW-LEVEL I2C COMMUNICATION
  # ============================================================================
  
  def read_unpack(self, address, size, format):
    """Read data from I2C slave and unpack using struct format"""
    # AVR's TWI module requires delay between write->read operations
    self.bus.write_byte(20, address)
    time.sleep(0.0001)
    byte_list = [self.bus.read_byte(20) for _ in range(size)]
    return struct.unpack(format, bytes(byte_list))

  def write_pack(self, address, format, *data):
    """Pack data using struct format and write to I2C slave"""
    data_array = list(struct.pack(format, *data))
    self.bus.write_i2c_block_data(20, address, data_array)
    time.sleep(0.0001)

  # ============================================================================
  # LED CONTROL
  # ============================================================================
  
  def leds(self, red, yellow, green):
    """Control RGB LEDs (0=off, 1=on)"""
    self.write_pack(0, 'BBB', red, yellow, green)

  # ============================================================================
  # MOTOR CONTROL
  # ============================================================================
  
  def motors(self, left, right):
    """Control left and right motors (-400 to 400)"""
    self.write_pack(6, 'hh', left, right)

  # ============================================================================
  # SENSOR READING
  # ============================================================================
  
  def read_buttons(self):
    """Read button states (A, B, C)"""
    return self.read_unpack(3, 3, "???")

  def read_battery_millivolts(self):
    """Read battery voltage in millivolts"""
    return self.read_unpack(10, 2, "H")

  def read_analog(self):
    """Read analog sensor values (6 channels)"""
    return self.read_unpack(12, 12, "HHHHHH")

  def read_encoders(self):
    """Read encoder counts (left, right)"""
    return self.read_unpack(39, 4, 'hh')

  # ============================================================================
  # BUZZER CONTROL
  # ============================================================================
  
  def play_notes(self, notes):
    """Play musical notes on buzzer"""
    self.write_pack(24, 'B14s', 1, notes.encode("ascii"))

  # ============================================================================
  # TEST FUNCTIONS
  # ============================================================================
  
  def test_read8(self):
    """Test function for reading 8 bytes"""
    self.read_unpack(0, 8, 'cccccccc')

  def test_write8(self):
    """Test function for writing 8 bytes"""
    self.bus.write_i2c_block_data(20, 0, [0,0,0,0,0,0,0,0])
    time.sleep(0.0001)

  # ============================================================================
  # SERVO CONTROL - PREDEFINED POSITIONS
  # ============================================================================
  
  # Servo position constants
  SERVO_NONE = 0
  SERVO_HOME = 1
  SERVO_HOLD = 2
  SERVO_LIFT = 3
  SERVO_GRIP = 4
  SERVO_CAPTURE = 5

  def servo_enable(self, enable=True):
    """Enable or disable servo control"""
    self.write_pack(44, 'B', int(enable))
    time.sleep(0.1)

  def servo_disable(self):
    """Disable servo control"""
    self.servo_enable(False)

  def servo_set_position(self, position):
    """Set servo to predefined position (0-5)"""
    self.write_pack(43, 'B', position)
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
    """Park servos (home then disable)"""
    self.servo_home()
    time.sleep(2)
    self.servo_disable()

  # ============================================================================
  # SERVO CONTROL - MANUAL PWM CONTROL
  # ============================================================================

  def servo_set_pwm(self, lift_pwm=None, tilt_pwm=None, gripper_pwm=None):
      """Set individual servo PWM values with range validation"""
      # Ensure servos are enabled
      if not self.servo_is_enabled():
          self.servo_enable(True)

      # Update provided PWM values with range checking
      if lift_pwm is not None:
          if 960 <= lift_pwm <= 1900:
              self.write_pack(45, 'H', lift_pwm)
          else:
              print(f"Warning: lift_pwm {lift_pwm} out of range (960-1900)")

      if tilt_pwm is not None:
          if 1210 <= tilt_pwm <= 1890:
              self.write_pack(47, 'H', tilt_pwm)
          else:
              print(f"Warning: tilt_pwm {tilt_pwm} out of range (1210-1890)")

      if gripper_pwm is not None:
          if 500 <= gripper_pwm <= 2330:
              self.write_pack(49, 'H', gripper_pwm)
          else:
              print(f"Warning: gripper_pwm {gripper_pwm} out of range (500-2330)")

  def servo_set_lift_pwm(self, pwm_value):
    """Set lift servo PWM value (960-1900μs)"""
    self.servo_set_pwm(lift_pwm=pwm_value)

  def servo_set_tilt_pwm(self, pwm_value):
    """Set tilt servo PWM value (1210-1890μs)"""
    self.servo_set_pwm(tilt_pwm=pwm_value)

  def servo_set_gripper_pwm(self, pwm_value):
    """Set gripper servo PWM value (500-2330μs)"""
    self.servo_set_pwm(gripper_pwm=pwm_value)

  # ============================================================================
  # SERVO STATUS READING
  # ============================================================================

  def read_servo_status(self):
    """Read servo enable status and current position"""
    try:
      position = self.read_unpack(43, 1, 'B')[0]
      enabled = self.read_unpack(44, 1, 'B')[0]
      return {
        'position': position,
        'enabled': bool(enabled)
      }
    except:
      return {'position': 0, 'enabled': False}

  def servo_get_pwm_values(self):
    """Read current PWM values for all servos"""
    try:
      lift_pwm = self.read_unpack(45, 2, 'H')[0]
      tilt_pwm = self.read_unpack(47, 2, 'H')[0]
      gripper_pwm = self.read_unpack(49, 2, 'H')[0]
      return {
        'lift': lift_pwm,
        'tilt': tilt_pwm, 
        'gripper': gripper_pwm
      }
    except:
      return {'lift': 1550, 'tilt': 1500, 'gripper': 500}

  def servo_is_enabled(self):
    """Check if servos are currently enabled"""
    try:
      return bool(self.read_unpack(44, 1, 'B')[0])
    except:
      return False