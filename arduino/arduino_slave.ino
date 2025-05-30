#include <Servo.h>
#include <Romi32U4.h>
#include <PololuRPiSlave.h>

// Servo objects with tested parameters
Servo liftServo;    // Pin 21, max-1900-down, min-1000-up, mid-1550-mid
Servo tiltServo;    // Pin 22, max-1750-up, min-1300-down, mid-1500-flat
Servo gripperServo; // Pin 11, max-2330-close, min-500-open, mid-1440-semiopen

// Servo limits (from your testing)
const int LIFT_MIN = 1000, LIFT_MAX = 1900, LIFT_MID = 1550;
const int TILT_MIN = 1300, TILT_MAX = 1750, TILT_MID = 1500;
const int GRIPPER_MIN = 500, GRIPPER_MAX = 2330, GRIPPER_MID = 1440;

// Preset positions
enum ServoPosition { NONE = 0, HOME = 1, HOLD = 2, LIFT = 3, GRIP = 4, CAPTURE = 5 };

// Custom data structure with servo control
struct Data
{
  bool yellow, green, red;           // 0, 1, 2 (3 bytes)
  bool buttonA, buttonB, buttonC;    // 3, 4, 5 (3 bytes)
  int16_t leftMotor, rightMotor;     // 6, 7, 8, 9 (4 bytes)
  uint16_t batteryMillivolts;        // 10, 11 (2 bytes)
  uint16_t analog[6];                // 12-23 (12 bytes)
  bool playNotes;                    // 24 (1 byte)
  char notes[14];                    // 25-38 (14 bytes)
  int16_t leftEncoder, rightEncoder; // 39-42 (4 bytes)
  uint8_t servoPosition;             // 43 (1 byte) 
  bool servoEnable;                  // 44 (1 byte)
};

PololuRPiSlave<struct Data,20> slave;
PololuBuzzer buzzer;
Romi32U4Motors motors;
Romi32U4ButtonA buttonA;
Romi32U4ButtonB buttonB;
Romi32U4ButtonC buttonC;
Romi32U4Encoders encoders;

// Servo state tracking
bool servosAttached = false;
uint8_t currentPosition = NONE;
unsigned long lastServoUpdate = 0;

void setup()
{
  Serial.begin(9600); 
  // Set up the slave at I2C address 20.
  slave.init(20);

  // Initialize servo control fields
  slave.buffer.servoPosition = NONE;
  slave.buffer.servoEnable = false;

  // Play startup sound.
  buzzer.play("v10>>g16>>>c16");
}

void loop()
{
  // Call updateBuffer() before using the buffer, to get the latest
  // data including recent master writes.
  slave.updateBuffer();

  // Write various values into the data structure.
  slave.buffer.buttonA = buttonA.isPressed();
  slave.buffer.buttonB = buttonB.isPressed();
  slave.buffer.buttonC = buttonC.isPressed();

  // Change this to readBatteryMillivoltsLV() for the LV model.
  slave.buffer.batteryMillivolts = readBatteryMillivolts();

  for(uint8_t i=0; i<6; i++)
  {
    slave.buffer.analog[i] = analogRead(i);
  }

  // READING the buffer is allowed before or after finalizeWrites().
  ledYellow(slave.buffer.yellow);
  ledGreen(slave.buffer.green);
  ledRed(slave.buffer.red);
  motors.setSpeeds(slave.buffer.leftMotor, slave.buffer.rightMotor);

  // Handle servo control with rate limiting
  handleServoControl();

  // Playing music involves both reading and writing, since we only
  // want to do it once.
  static bool startedPlaying = false;
  
  if(slave.buffer.playNotes && !startedPlaying)
  {
    buzzer.play(slave.buffer.notes);
    startedPlaying = true;
  }
  else if (startedPlaying && !buzzer.isPlaying())
  {
    slave.buffer.playNotes = false;
    startedPlaying = false;
  }

  slave.buffer.leftEncoder = encoders.getCountsLeft();
  slave.buffer.rightEncoder = encoders.getCountsRight();

  // When you are done WRITING, call finalizeWrites() to make modified
  // data available to I2C master.
  slave.finalizeWrites();
}

void handleServoControl() {
  // Rate limiting: only update servos every 100ms to prevent jitter
  if (millis() - lastServoUpdate < 100) {
    return;
  }
  lastServoUpdate = millis();

  ////////////////// DEBUG LINES //////////////////////////////////////////////////////
  Serial.print("servoEnable: ");
  Serial.print(slave.buffer.servoEnable);
  Serial.print(", servoPosition: ");
  Serial.print(slave.buffer.servoPosition);
  Serial.print(", servosAttached: ");
  Serial.print(servosAttached);
  Serial.print(", currentPosition: ");
  Serial.println(currentPosition);
////////////////////////////////////////////////////////////////////////////////////////

  // Handle servo enable/disable
  if (slave.buffer.servoEnable && !servosAttached) {
    // Enable servos
    liftServo.attach(21);
    tiltServo.attach(22);
    gripperServo.attach(11);
    servosAttached = true;
    buzzer.play("!c32");
  }
  else if (!slave.buffer.servoEnable && servosAttached) {
    // Disable servos
    liftServo.detach();
    tiltServo.detach();
    gripperServo.detach();
    servosAttached = false;
    
    // Reset pins to prevent interference
    pinMode(21, INPUT);
    pinMode(22, INPUT);
    pinMode(11, INPUT);
    
    buzzer.play("!c16c16");
    currentPosition = NONE;
  }

  // Handle position commands if servos are attached
  if (servosAttached && slave.buffer.servoPosition != currentPosition) {
    moveToPosition(slave.buffer.servoPosition);
    currentPosition = slave.buffer.servoPosition;
  }
}

void moveToPosition(uint8_t position) {
  if (!servosAttached) return;
  
  switch(position) {
    case HOME:
      // Home position (mid, flat, open)
      liftServo.writeMicroseconds(LIFT_MID);   // 1550 - mid
      tiltServo.writeMicroseconds(TILT_MID);   // 1500 - flat
      gripperServo.writeMicroseconds(GRIPPER_MIN); // 500 - open
      buzzer.play("!c64");
      break;
      
    case HOLD:
      // Hold position (mid, flat, close)
      liftServo.writeMicroseconds(LIFT_MID);   // 1550 - mid
      tiltServo.writeMicroseconds(TILT_MID);   // 1500 - flat
      gripperServo.writeMicroseconds(GRIPPER_MAX); // 2330 - close
      buzzer.play("!d64");
      break;
      
    case LIFT:
      // Lift position (up, up, close)
      liftServo.writeMicroseconds(LIFT_MIN);   // 1000 - up
      tiltServo.writeMicroseconds(TILT_MAX);   // 1750 - up
      gripperServo.writeMicroseconds(GRIPPER_MAX); // 2330 - close
      buzzer.play("!e64");
      break;
      
    case GRIP:
      // Grip position (down, down, close)
      liftServo.writeMicroseconds(LIFT_MAX);   // 1900 - down
      tiltServo.writeMicroseconds(TILT_MIN);   // 1300 - down
      gripperServo.writeMicroseconds(GRIPPER_MAX); // 2330 - close
      buzzer.play("!f64");
      break;
      
    case CAPTURE:
      // Capture position (down, down, open)
      liftServo.writeMicroseconds(LIFT_MAX);   // 1900 - down
      tiltServo.writeMicroseconds(TILT_MIN);   // 1300 - down
      gripperServo.writeMicroseconds(GRIPPER_MIN); // 500 - open
      buzzer.play("!g64");
      break;
      
    default:
      // Invalid position, do nothing
      break;
  }
}