# servo_control.py - Completely separate servo control
import smbus
import time

class ServoControl:
    def __init__(self, bus_number=1, i2c_address=20):
        self.bus = smbus.SMBus(bus_number)
        self.address = i2c_address
        
    def _send_command(self, command, data=None):
        """Send command to Arduino via direct I2C"""
        try:
            if data is None:
                self.bus.write_byte(self.address, command)
            else:
                cmd_data = [command] + data
                self.bus.write_i2c_block_data(self.address, cmd_data[0], cmd_data[1:])
            time.sleep(0.01)  # Small delay
        except Exception as e:
            print(f"Servo command error: {e}")
    
    def enable(self):
        """Enable servo control"""
        self._send_command(1)
        
    def disable(self):
        """Disable servo control"""
        self._send_command(2)
        
    def set_lift(self, microseconds):
        """Set lift servo position (1000-1900)"""
        microseconds = max(1000, min(1900, microseconds))
        data = [microseconds & 0xFF, (microseconds >> 8) & 0xFF]
        self._send_command(3, data)
        
    def set_tilt(self, microseconds):
        """Set tilt servo position (1200-1900)"""
        microseconds = max(1200, min(1900, microseconds))
        data = [microseconds & 0xFF, (microseconds >> 8) & 0xFF]
        self._send_command(4, data)
        
    def set_gripper(self, microseconds):
        """Set gripper servo position (500-2300)"""
        microseconds = max(500, min(2300, microseconds))
        data = [microseconds & 0xFF, (microseconds >> 8) & 0xFF]
        self._send_command(5, data)
        
    def home(self):
        """Move to home position"""
        self._send_command(10)
        
    def park(self):
        """Move to park position and disable"""
        self._send_command(11)
        
    # Convenience methods
    def lift_up(self):
        self.enable()
        self.set_lift(1000)
        
    def lift_down(self):
        self.enable()
        self.set_lift(1900)
        
    def lift_mid(self):
        self.enable()
        self.set_lift(1450)
        
    def tilt_up(self):
        self.enable()
        self.set_tilt(1900)
        
    def tilt_down(self):
        self.enable()
        self.set_tilt(1200)
        
    def tilt_mid(self):
        self.enable()
        self.set_tilt(1550)
        
    def gripper_open(self):
        self.enable()
        self.set_gripper(500)
        
    def gripper_close(self):
        self.enable()
        self.set_gripper(2300)
        
    def gripper_half(self):
        self.enable()
        self.set_gripper(1400)
        
    def get_status(self):
        """Read servo status"""
        try:
            # Request status from Arduino
            data = self.bus.read_i2c_block_data(self.address, 0, 7)
            enabled = bool(data[0])
            lift_pos = data[1] | (data[2] << 8)
            tilt_pos = data[3] | (data[4] << 8)
            gripper_pos = data[5] | (data[6] << 8)
            
            return {
                'enabled': enabled,
                'lift': lift_pos,
                'tilt': tilt_pos,
                'gripper': gripper_pos
            }
        except:
            return {
                'enabled': False,
                'lift': 0,
                'tilt': 0,
                'gripper': 0
            }