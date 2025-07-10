// Copyright Pololu Corporation.  For more information, see https://www.pololu.com/

// ============================================================================
// INCLUDES AND LIBRARIES
// ============================================================================

#include <Servo.h>
#include <Romi32U4.h>
#include <PololuRPiSlave.h>

// ============================================================================
// SERVO CONFIGURATION
// ============================================================================

// Servo objects with tested parameters
Servo liftServo;    // Pin 21, max-1900-down, min-960-up, mid-1550-mid
Servo tiltServo;    // Pin 22, max-1890-up, min-1210-down, mid-1500-flat
Servo gripperServo; // Pin 11, max-2330-close, min-500-open, mid-1440-semiopen

// Servo limits (from testing)
const int LIFT_MIN = 960, LIFT_MAX = 1630, LIFT_MID = 1550;
const int TILT_MIN = 1515, TILT_MAX = 1900, TILT_MID = 1700;
const int GRIPPER_MIN = 500, GRIPPER_MAX = 2400, GRIPPER_MID = 1440;

// Preset positions
enum ServoPosition { NONE = 0, HOME = 1, HOLD = 2, LIFT = 3, GRIP = 4, CAPTURE = 5 };

// ============================================================================
// DATA STRUCTURE FOR I2C COMMUNICATION
// ============================================================================

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
  uint16_t liftPWM;                  // 45-46 (2 bytes)
  uint16_t tiltPWM;                  // 47-48 (2 bytes)
  uint16_t gripperPWM;               // 49-50 (2 bytes)
};

// ============================================================================
// HARDWARE OBJECTS
// ============================================================================

PololuRPiSlave<struct Data,20> slave;
PololuBuzzer buzzer;
Romi32U4Motors motors;
Romi32U4ButtonA buttonA;
Romi32U4ButtonB buttonB;
Romi32U4ButtonC buttonC;
Romi32U4Encoders encoders;

// ============================================================================
// SERVO STATE VARIABLES
// ============================================================================

bool servosAttached = false;
uint8_t currentPosition = NONE;
unsigned long lastServoUpdate = 0;

// Current PWM values
int currentLiftPulse = LIFT_MID;      // 1550 - initial position
int currentTiltPulse = TILT_MID;      // 1500 - initial position  
int currentGripperPulse = GRIPPER_MIN; // 500 - initial position

// Target PWM values for smooth movement
int targetLiftPulse = LIFT_MID;
int targetTiltPulse = TILT_MID;
int targetGripperPulse = GRIPPER_MIN;

// Servo movement speeds
const int LIFT_SPEED = 10;      // Slower for lift
const int TILT_SPEED = 10;      // Medium speed for tilt
const int GRIPPER_SPEED = 40;   // Faster for gripper due to larger range

// ============================================================================
// SETUP - INITIALIZATION
// ============================================================================

void setup()
{
  Serial.begin(9600); 
  Serial.println("Arduino starting up..."); 

  // Set up the I2C slave at address 20
  slave.init(20);

  // Initialize servo control fields
  slave.buffer.servoPosition = NONE;
  slave.buffer.servoEnable = false;

  // Play startup sound
  buzzer.play("v10>>g16>>>c16");
  Serial.println("Setup finished"); 
}

// ============================================================================
// MAIN LOOP
// ============================================================================

void loop()
{
  // Update buffer with latest I2C data from master
  slave.updateBuffer();

  // Debug output
  debugPrint();

  // Read and write sensor data
  updateSensorData();

  // Control hardware based on buffer data
  controlHardware();

  // Handle servo control with rate limiting
  handleServoControl();

  // Handle buzzer/music playback
  handleBuzzer();

  // Update encoder readings
  updateEncoders();

  // Finalize writes to make data available to I2C master
  slave.finalizeWrites();
}

// ============================================================================
// DEBUG FUNCTIONS
// ============================================================================

void debugPrint() {
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint > 1000) { // Every 1 second
    Serial.print("Motors: L=");
    Serial.print(slave.buffer.leftMotor);
    Serial.print(" R=");
    Serial.print(slave.buffer.rightMotor);
    Serial.print(" | Servo: en=");
    Serial.print(slave.buffer.servoEnable);
    Serial.print(" pos=");
    Serial.print(slave.buffer.servoPosition);
    Serial.print(" att=");
    Serial.println(servosAttached);
    lastPrint = millis();
  }
}

// ============================================================================
// SENSOR DATA HANDLING
// ============================================================================

void updateSensorData() {
  // Read button states
  slave.buffer.buttonA = buttonA.isPressed();
  slave.buffer.buttonB = buttonB.isPressed();
  slave.buffer.buttonC = buttonC.isPressed();

  // Read battery voltage (change to readBatteryMillivoltsLV() for LV model)
  slave.buffer.batteryMillivolts = readBatteryMillivolts();

  // Read analog sensor values
  for(uint8_t i=0; i<6; i++) {
    slave.buffer.analog[i] = analogRead(i);
  }
}

void updateEncoders() {
  slave.buffer.leftEncoder = encoders.getCountsLeft();
  slave.buffer.rightEncoder = encoders.getCountsRight();
}

// ============================================================================
// HARDWARE CONTROL
// ============================================================================

void controlHardware() {
  // Control LEDs
  ledYellow(slave.buffer.yellow);
  ledGreen(slave.buffer.green);
  ledRed(slave.buffer.red);
  
  // Control motors
  motors.setSpeeds(slave.buffer.leftMotor, slave.buffer.rightMotor);
}

// ============================================================================
// BUZZER CONTROL
// ============================================================================

void handleBuzzer() {
  static bool startedPlaying = false;
  
  if(slave.buffer.playNotes && !startedPlaying) {
    buzzer.play(slave.buffer.notes);
    startedPlaying = true;
  }
  else if (startedPlaying && !buzzer.isPlaying()) {
    slave.buffer.playNotes = false;
    startedPlaying = false;
  }
}

// ============================================================================
// SERVO CONTROL - MAIN HANDLER
// ============================================================================

void handleServoControl() {
  if (millis() - lastServoUpdate < 20) {
    return;
  }
  lastServoUpdate = millis();

  // Handle servo enable/disable
  handleServoEnable();
  
  if (!servosAttached) return;

  // Always perform smooth movement
  smoothServoMovement();

  // Handle PWM control - this updates target values
  if (handlePWMControl()) {
    return; // PWM control active, skip preset positions
  }

  // Handle preset position control
  handlePresetPositions();
}

// ============================================================================
// SERVO CONTROL - SMOOTH MOVEMENT
// ============================================================================

void smoothServoMovement() {
  // Lift servo smooth movement
  if (currentLiftPulse != targetLiftPulse) {
    int diff = targetLiftPulse - currentLiftPulse;
    if (abs(diff) <= LIFT_SPEED) {
      currentLiftPulse = targetLiftPulse;
    } else {
      currentLiftPulse += (diff > 0) ? LIFT_SPEED : -LIFT_SPEED;
    }
    liftServo.writeMicroseconds(currentLiftPulse);
  }

  // Tilt servo smooth movement
  if (currentTiltPulse != targetTiltPulse) {
    int diff = targetTiltPulse - currentTiltPulse;
    if (abs(diff) <= TILT_SPEED) {
      currentTiltPulse = targetTiltPulse;
    } else {
      currentTiltPulse += (diff > 0) ? TILT_SPEED : -TILT_SPEED;
    }
    tiltServo.writeMicroseconds(currentTiltPulse);
  }

  // Gripper servo smooth movement
  if (currentGripperPulse != targetGripperPulse) {
    int diff = targetGripperPulse - currentGripperPulse;
    if (abs(diff) <= GRIPPER_SPEED) {
      currentGripperPulse = targetGripperPulse;
    } else {
      currentGripperPulse += (diff > 0) ? GRIPPER_SPEED : -GRIPPER_SPEED;
    }
    gripperServo.writeMicroseconds(currentGripperPulse);
  }
}

// ============================================================================
// SERVO CONTROL - ENABLE/DISABLE
// ============================================================================

void handleServoEnable() {
  if (slave.buffer.servoEnable && !servosAttached) {
    // Enable servos
    liftServo.attach(21);
    tiltServo.attach(22);
    gripperServo.attach(11);
    
    // Initialize servos to current positions
    liftServo.writeMicroseconds(currentLiftPulse);
    tiltServo.writeMicroseconds(currentTiltPulse);
    gripperServo.writeMicroseconds(currentGripperPulse);
    
    // Set targets to match current positions
    targetLiftPulse = currentLiftPulse;
    targetTiltPulse = currentTiltPulse;
    targetGripperPulse = currentGripperPulse;
    
    servosAttached = true;
    buzzer.play("!c32");
    Serial.println("Servos enabled");
  }
  else if (!slave.buffer.servoEnable && servosAttached) {
    // Disable servos
    liftServo.detach();
    tiltServo.detach();
    gripperServo.detach();
    servosAttached = false;
    buzzer.play("!c16c16");
    currentPosition = NONE;
    Serial.println("Servos disabled");
  }
}

// ============================================================================
// SERVO CONTROL - PWM CONTROL
// ============================================================================

bool handlePWMControl() {
  static uint16_t lastLiftPWM = 0, lastTiltPWM = 0, lastGripperPWM = 0;
  bool pwmChanged = false;
  
  // Check if PWM values have changed and apply them
  if (slave.buffer.liftPWM != lastLiftPWM && 
      slave.buffer.liftPWM >= LIFT_MIN && 
      slave.buffer.liftPWM <= LIFT_MAX) {
    targetLiftPulse = slave.buffer.liftPWM;
    lastLiftPWM = slave.buffer.liftPWM;
    pwmChanged = true;
    Serial.print("Lift PWM: "); Serial.println(slave.buffer.liftPWM);
  }
  
  if (slave.buffer.tiltPWM != lastTiltPWM && 
      slave.buffer.tiltPWM >= TILT_MIN && 
      slave.buffer.tiltPWM <= TILT_MAX) {
    targetTiltPulse = slave.buffer.tiltPWM;
    lastTiltPWM = slave.buffer.tiltPWM;
    pwmChanged = true;
    Serial.print("Tilt PWM: "); Serial.println(slave.buffer.tiltPWM);
  }
  
  if (slave.buffer.gripperPWM != lastGripperPWM && 
      slave.buffer.gripperPWM >= GRIPPER_MIN && 
      slave.buffer.gripperPWM <= GRIPPER_MAX) {
    targetGripperPulse = slave.buffer.gripperPWM;
    lastGripperPWM = slave.buffer.gripperPWM;
    pwmChanged = true;
    Serial.print("Gripper PWM: "); Serial.println(slave.buffer.gripperPWM);
  }
  
  // If PWM changed, clear preset position state
  if (pwmChanged) {
    currentPosition = NONE;
    slave.buffer.servoPosition = NONE; // Clear position buffer
    return true; // PWM control is active
  }
  
  return false; // No PWM changes
}

// ============================================================================
// SERVO CONTROL - PRESET POSITIONS
// ============================================================================

void handlePresetPositions() {
  // Only handle preset positions if no PWM control is active
  if (slave.buffer.servoPosition != currentPosition && 
      slave.buffer.servoPosition != NONE) {
    moveToPosition(slave.buffer.servoPosition);
    currentPosition = slave.buffer.servoPosition;
    
    // Sync PWM values to buffer for slider display
    syncPWMToBuffer();
  }
}

void moveToPosition(uint8_t position) {
  if (!servosAttached) return;
  
  switch(position) {
    case HOME:
      targetLiftPulse = 1446;      // 1550
      targetTiltPulse = 1791;      // 1500
      // buzzer.play("!c64");
      break;
      
    case HOLD:
      targetLiftPulse = 1487;      // 1550  hold the object (can run in this arm state)
      targetTiltPulse = 1789;      // 1500
      // buzzer.play("!d64");
      break;
      
    case LIFT:
      targetLiftPulse = LIFT_MIN;      //  960
      targetTiltPulse = TILT_MAX;      // 1890
      // buzzer.play("!e64");
      break;
      
    case GRIP:
      targetLiftPulse = 1536;      
      targetTiltPulse = 1710;      // for capture the badminton
      targetGripperPulse = GRIPPER_MIN; // 500
      // buzzer.play("!f64");
      break;
      
    case CAPTURE:
      targetLiftPulse = 1506;      // 
      targetTiltPulse = TILT_MIN;      // for capture/drag desktop stuff
      targetGripperPulse = GRIPPER_MIN; // 500
      // buzzer.play("!g64");
      break;
  }
}

void applyServoPositions() {
  liftServo.writeMicroseconds(currentLiftPulse);
  tiltServo.writeMicroseconds(currentTiltPulse);
  gripperServo.writeMicroseconds(currentGripperPulse);
}

void syncPWMToBuffer() {
  slave.buffer.liftPWM = targetLiftPulse;
  slave.buffer.tiltPWM = targetTiltPulse;
  slave.buffer.gripperPWM = targetGripperPulse;
}