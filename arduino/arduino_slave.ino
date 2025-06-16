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
Servo liftServo;    // Pin 21, max-1900-down, min-1000-up, mid-1550-mid
Servo tiltServo;    // Pin 22, max-1890-up, min-1210-down, mid-1500-flat
Servo gripperServo; // Pin 11, max-2330-close, min-500-open, mid-1440-semiopen

// Servo limits (from testing)
const int LIFT_MIN = 1000, LIFT_MAX = 1630, LIFT_MID = 1550;
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

// ============================================================================
// ANTI-JITTER WITH STATIC DETECTION
// ============================================================================

// Anti-jitter parameters
const int PWM_DEADZONE = 10;        // Increased deadzone for better stability
const int PWM_FILTER_ALPHA = 3;    // Low-pass filter strength
const unsigned long SERVO_UPDATE_MIN_INTERVAL = 20; // Minimum ms between servo updates
const int STATIC_THRESHOLD = 3;     // Consider static when filtered value is within this range of target
const unsigned long STATIC_TIMEOUT = 300; // Time (ms) before considering servo static

// Filtered PWM values for smooth transitions
int filteredLiftPulse = LIFT_MID;
int filteredTiltPulse = TILT_MID;
int filteredGripperPulse = GRIPPER_MIN;

// Target PWM values
int targetLiftPulse = LIFT_MID;
int targetTiltPulse = TILT_MID;
int targetGripperPulse = GRIPPER_MIN;

// Last actual PWM values sent to servos
int lastLiftPulse = LIFT_MID;
int lastTiltPulse = TILT_MID;
int lastGripperPulse = GRIPPER_MIN;

// Static detection
unsigned long lastLiftChange = 0;
unsigned long lastTiltChange = 0;
unsigned long lastGripperChange = 0;
bool liftIsStatic = false;
bool tiltIsStatic = false;
bool gripperIsStatic = false;

// Timing for servo updates
unsigned long lastServoCommandTime = 0;

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
    Serial.print("Servo Static: L=");
    Serial.print(liftIsStatic ? "Y" : "N");
    Serial.print(" T=");
    Serial.print(tiltIsStatic ? "Y" : "N");
    Serial.print(" G=");
    Serial.print(gripperIsStatic ? "Y" : "N");
    Serial.print(" | Target: L=");
    Serial.print(targetLiftPulse);
    Serial.print(" T=");
    Serial.print(targetTiltPulse);
    Serial.print(" | Filtered: L=");
    Serial.print(filteredLiftPulse);
    Serial.print(" T=");
    Serial.println(filteredTiltPulse);
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
// MAIN SERVO HANDLER - ENHANCED WITH STATIC OPTIMIZATION
// ============================================================================

void handleServoControl() {
  // Skip most processing if all servos are static
  if (servosAttached && liftIsStatic && tiltIsStatic && gripperIsStatic) {
    // Only check for enable/disable or position changes
    handleServoEnable();
    
    // Check if new commands arrived
    static uint16_t lastCheckedLiftPWM = 0, lastCheckedTiltPWM = 0, lastCheckedGripperPWM = 0;
    static uint8_t lastCheckedPosition = NONE;
    
    if (slave.buffer.liftPWM != lastCheckedLiftPWM || 
        slave.buffer.tiltPWM != lastCheckedTiltPWM ||
        slave.buffer.gripperPWM != lastCheckedGripperPWM ||
        slave.buffer.servoPosition != lastCheckedPosition) {
      // New command detected, process normally
      lastCheckedLiftPWM = slave.buffer.liftPWM;
      lastCheckedTiltPWM = slave.buffer.tiltPWM;
      lastCheckedGripperPWM = slave.buffer.gripperPWM;
      lastCheckedPosition = slave.buffer.servoPosition;
    } else {
      // No changes, skip processing
      return;
    }
  }
  
  // Handle servo enable/disable
  handleServoEnable();
  
  if (!servosAttached) return;

  // Handle PWM control with priority over preset positions
  if (handlePWMControl()) {
    return; // PWM control active, skip preset positions
  }

  // Handle preset position control
  handlePresetPositions();
  
  // Always update filtered positions (for smooth transitions)
  updateFilteredServoPositions();
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
// SERVO CONTROL - PWM CONTROL WITH STATIC DETECTION
// ============================================================================

bool handlePWMControl() {
  static uint16_t lastLiftPWM = 0, lastTiltPWM = 0, lastGripperPWM = 0;
  bool pwmChanged = false;
  unsigned long currentTime = millis();
  
  // Check if PWM values have changed significantly
  if (abs(slave.buffer.liftPWM - lastLiftPWM) > PWM_DEADZONE && 
      slave.buffer.liftPWM >= LIFT_MIN && 
      slave.buffer.liftPWM <= LIFT_MAX) {
    targetLiftPulse = slave.buffer.liftPWM;
    lastLiftPWM = slave.buffer.liftPWM;
    lastLiftChange = currentTime;
    liftIsStatic = false;
    pwmChanged = true;
  }
  
  if (abs(slave.buffer.tiltPWM - lastTiltPWM) > PWM_DEADZONE && 
      slave.buffer.tiltPWM >= TILT_MIN && 
      slave.buffer.tiltPWM <= TILT_MAX) {
    targetTiltPulse = slave.buffer.tiltPWM;
    lastTiltPWM = slave.buffer.tiltPWM;
    lastTiltChange = currentTime;
    tiltIsStatic = false;
    pwmChanged = true;
  }
  
  if (abs(slave.buffer.gripperPWM - lastGripperPWM) > PWM_DEADZONE && 
      slave.buffer.gripperPWM >= GRIPPER_MIN && 
      slave.buffer.gripperPWM <= GRIPPER_MAX) {
    targetGripperPulse = slave.buffer.gripperPWM;
    lastGripperPWM = slave.buffer.gripperPWM;
    lastGripperChange = currentTime;
    gripperIsStatic = false;
    pwmChanged = true;
  }
  
  // If PWM changed, clear preset position state
  if (pwmChanged) {
    currentPosition = NONE;
    slave.buffer.servoPosition = NONE;
    return true;
  }
  
  return false;
}

// ============================================================================
// SERVO FILTERING WITH STATIC DETECTION
// ============================================================================

void updateFilteredServoPositions() {
  // Don't update too frequently
  if (millis() - lastServoCommandTime < SERVO_UPDATE_MIN_INTERVAL) {
    return;
  }
  
  unsigned long currentTime = millis();
  bool needsUpdate = false;
  
  // LIFT SERVO
  if (!liftIsStatic) {
    // Apply exponential moving average filter
    int newFiltered = ((PWM_FILTER_ALPHA - 1) * filteredLiftPulse + targetLiftPulse) / PWM_FILTER_ALPHA;
    
    // Check if we're close to target
    if (abs(newFiltered - targetLiftPulse) <= STATIC_THRESHOLD) {
      // Close to target, check timeout
      if (currentTime - lastLiftChange > STATIC_TIMEOUT) {
        // Lock to target value
        filteredLiftPulse = targetLiftPulse;
        liftIsStatic = true;
        Serial.println("Lift servo locked to static position");
      } else {
        filteredLiftPulse = newFiltered;
      }
    } else {
      filteredLiftPulse = newFiltered;
      lastLiftChange = currentTime; // Reset timeout if still moving
    }
    
    // Only update servo if filtered value has changed significantly
    if (abs(filteredLiftPulse - lastLiftPulse) > PWM_DEADZONE) {
      liftServo.writeMicroseconds(filteredLiftPulse);
      lastLiftPulse = filteredLiftPulse;
      needsUpdate = true;
    }
  }
  
  // TILT SERVO
  if (!tiltIsStatic) {
    int newFiltered = ((PWM_FILTER_ALPHA - 1) * filteredTiltPulse + targetTiltPulse) / PWM_FILTER_ALPHA;
    
    if (abs(newFiltered - targetTiltPulse) <= STATIC_THRESHOLD) {
      if (currentTime - lastTiltChange > STATIC_TIMEOUT) {
        filteredTiltPulse = targetTiltPulse;
        tiltIsStatic = true;
        Serial.println("Tilt servo locked to static position");
      } else {
        filteredTiltPulse = newFiltered;
      }
    } else {
      filteredTiltPulse = newFiltered;
      lastTiltChange = currentTime;
    }
    
    if (abs(filteredTiltPulse - lastTiltPulse) > PWM_DEADZONE) {
      tiltServo.writeMicroseconds(filteredTiltPulse);
      lastTiltPulse = filteredTiltPulse;
      needsUpdate = true;
    }
  }
  
  // GRIPPER SERVO
  if (!gripperIsStatic) {
    int newFiltered = ((PWM_FILTER_ALPHA - 1) * filteredGripperPulse + targetGripperPulse) / PWM_FILTER_ALPHA;
    
    if (abs(newFiltered - targetGripperPulse) <= STATIC_THRESHOLD) {
      if (currentTime - lastGripperChange > STATIC_TIMEOUT) {
        filteredGripperPulse = targetGripperPulse;
        gripperIsStatic = true;
        Serial.println("Gripper servo locked to static position");
      } else {
        filteredGripperPulse = newFiltered;
      }
    } else {
      filteredGripperPulse = newFiltered;
      lastGripperChange = currentTime;
    }
    
    if (abs(filteredGripperPulse - lastGripperPulse) > PWM_DEADZONE) {
      gripperServo.writeMicroseconds(filteredGripperPulse);
      lastGripperPulse = filteredGripperPulse;
      needsUpdate = true;
    }
  }
  
  if (needsUpdate) {
    lastServoCommandTime = millis();
  }
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

// ============================================================================
// SERVO CONTROL - PRESET POSITIONS (ENHANCED)
// ============================================================================

void moveToPosition(uint8_t position) {
  if (!servosAttached) return;
  
  unsigned long currentTime = millis();
  
  switch(position) {
    case HOME:
      targetLiftPulse = 1446;
      targetTiltPulse = 1791;
      break;
      
    case HOLD:
      targetLiftPulse = 1487;
      targetTiltPulse = 1789;
      break;
      
    case LIFT:
      targetLiftPulse = LIFT_MIN;
      targetTiltPulse = TILT_MAX;
      break;
      
    case GRIP:
      targetLiftPulse = 1536;
      targetTiltPulse = 1710;
      targetGripperPulse = GRIPPER_MIN;
      break;
      
    case CAPTURE:
      targetLiftPulse = 1506;
      targetTiltPulse = TILT_MIN;
      targetGripperPulse = GRIPPER_MIN;
      break;
  }
  
  // Reset static flags and update change times
  liftIsStatic = false;
  tiltIsStatic = false;
  gripperIsStatic = false;
  lastLiftChange = currentTime;
  lastTiltChange = currentTime;
  lastGripperChange = currentTime;
  
  // Initialize filtered values to current positions for smooth transition
  filteredLiftPulse = lastLiftPulse;
  filteredTiltPulse = lastTiltPulse;
  filteredGripperPulse = lastGripperPulse;
}

void applyServoPositions() {
  liftServo.writeMicroseconds(currentLiftPulse);
  tiltServo.writeMicroseconds(currentTiltPulse);
  gripperServo.writeMicroseconds(currentGripperPulse);
}

void syncPWMToBuffer() {
  slave.buffer.liftPWM = currentLiftPulse;
  slave.buffer.tiltPWM = currentTiltPulse;
  slave.buffer.gripperPWM = currentGripperPulse;
}