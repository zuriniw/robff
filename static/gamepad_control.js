// Copyright Pololu Corporation. For more information, see https://www.pololu.com/
// ============================================================================
// 8BITDO PRO 2 GAMEPAD CONTROL MODULE
// ============================================================================

/**
 * Gamepad control module for robot car using 8BitDo Pro 2 controller
 * Handles analog stick movement, D-pad servo control, and button macros
 */

class GamepadControls {
  constructor() {
    // Gamepad state
    this.gamepad = null
    this.gamepadIndex = null
    this.isConnected = false
    
    // Control parameters
    this.deadZone = 0.3
    this.maxMotorSpeed = 400  // Maximum motor speed
    this.servoStep = 30       // PWM step for D-pad control (tilt)
    this.gripperStep = 90     // PWM step for gripper (3x faster)
    this.servoUpdateInterval = 50  // ms between servo updates
    
    // Timing control
    this.lastInputTime = 0
    this.noInputTimeout = 0  // ms before emergency stop
    this.macroBlockTime = 500  // ms to block continuous lift after macro
    this.lastMacroTime = 0
    this.lastServoUpdateTime = 0
    
    // Movement state
    this.currentVx = 0
    this.currentVy = 0
    
    // Button state tracking (for edge detection)
    this.prevButtonState = {}
    
    // External dependencies
    this.setMotors = null
    this.isSystemPaused = null
    this.stopMovement = null
    this.setServoPWM = null
    this.updateSliderValue = null
    this.servoMacros = {
      capture: null,
      lift: null,
      grip: null,
      hold: null
    }
    
    // Polling
    this.pollInterval = null
    this.pollRate = 50  // ms between polls (reduced from 20ms to avoid conflict)
  }
  
  /**
   * Initialize gamepad controls with required dependencies
   */
  init(dependencies) {
    // Validate dependencies
    if (!dependencies.setMotors || !dependencies.isSystemPaused || 
        !dependencies.stopMovement || !dependencies.setServoPWM || 
        !dependencies.updateSliderValue) {
      console.error('GamepadControls: Missing required dependencies')
      return false
    }
    
    // Set dependencies
    this.setMotors = dependencies.setMotors
    this.isSystemPaused = dependencies.isSystemPaused
    this.stopMovement = dependencies.stopMovement
    this.setServoPWM = dependencies.setServoPWM
    this.updateSliderValue = dependencies.updateSliderValue
    
    // Set servo macros
    if (dependencies.servoMacros) {
      this.servoMacros = { ...this.servoMacros, ...dependencies.servoMacros }
    }
    
    // Setup gamepad event listeners
    this.setupEventListeners()
    
    // Start polling loop
    this.startPolling()
    
    console.log('GamepadControls: Initialized successfully')
    console.log('  Left stick: Movement control only')
    console.log('  D-pad up/down: Tilt control')
    console.log('  D-pad left/right: Gripper control (3x speed)')
    console.log('  Right stick vertical: Lift control')
    console.log('  B: Capture, Y: Grip, X: Lift, A: Hold')
    console.log('  Poll rate: 50ms to avoid conflict with keyboard')
    
    return true
  }
  
  /**
   * Setup gamepad connection event listeners
   */
  setupEventListeners() {
    window.addEventListener('gamepadconnected', (e) => {
      console.log('Gamepad connected:', e.gamepad.id)
      this.gamepadIndex = e.gamepad.index
      this.isConnected = true
      
      // Show connection status
      this.updateConnectionStatus(true)
    })
    
    window.addEventListener('gamepaddisconnected', (e) => {
      console.log('Gamepad disconnected')
      if (e.gamepad.index === this.gamepadIndex) {
        this.gamepadIndex = null
        this.isConnected = false
        this.gamepad = null
        
        // Emergency stop
        this.emergencyStop()
        
        // Update status
        this.updateConnectionStatus(false)
      }
    })
  }
  
  /**
   * Start the polling loop
   */
  startPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
    }
    
    this.pollInterval = setInterval(() => {
      this.update()
    }, this.pollRate)
  }
  
  /**
   * Main update loop - poll gamepad state
   */
  update() {
    // Check for connected gamepad
    if (!this.isConnected || this.gamepadIndex === null) {
      return
    }
    
    // Get latest gamepad state
    const gamepads = navigator.getGamepads()
    this.gamepad = gamepads[this.gamepadIndex]
    
    if (!this.gamepad) {
      return
    }
    
    // Skip if system is paused
    if (this.isSystemPaused && this.isSystemPaused()) {
      return
    }
    
    // Process inputs
    const hasInput = this.processInputs()
    
    // Check for no input timeout
    const now = Date.now()
    if (hasInput) {
      this.lastInputTime = now
    } else if (now - this.lastInputTime > this.noInputTimeout) {
      // Emergency stop after timeout
      this.emergencyStop()
    }
  }
  
  /**
   * Process all gamepad inputs
   * @returns {boolean} True if any input was detected
   */
  processInputs() {
    let hasInput = false
    
    // Process movement (left stick + ABXY buttons)
    if (this.processMovement()) {
      hasInput = true
    }
    
    // Process D-pad servo control
    if (this.processDPadServos()) {
      hasInput = true
    }
    
    // Process right stick lift control
    if (this.processRightStickLift()) {
      hasInput = true
    }
    
    // Process macro buttons
    if (this.processButtonMacros()) {
      hasInput = true
    }
    
    return hasInput
  }
  
  /**
   * Process movement from left stick and ABXY buttons
   * @returns {boolean} True if movement input detected
   */
  processMovement() {
    const axes = this.gamepad.axes
    
    // Get left stick values with dead zone
    let stickX = Math.abs(axes[0]) > this.deadZone ? axes[0] : 0
    let stickY = Math.abs(axes[1]) > this.deadZone ? axes[1] : 0
    
    // Now only use left stick for movement, no button input
    let vx = stickX
    let vy = stickY
    
    // Normalize if magnitude > 1 (shouldn't happen with just stick, but safe)
    const magnitude = Math.sqrt(vx * vx + vy * vy)
    if (magnitude > 1) {
      vx /= magnitude
      vy /= magnitude
    }
    
    // Check if movement changed significantly
    const changed = Math.abs(vx - this.currentVx) > 0.01 || 
                   Math.abs(vy - this.currentVy) > 0.01
    
    if (changed || magnitude > 0) {
      this.currentVx = vx
      this.currentVy = vy
      
      // Convert to differential drive
      const motorSpeeds = this.vectorToMotors(vx, vy)
      this.setMotors(motorSpeeds.left, motorSpeeds.right)
      
      return true
    }
    
    return false
  }
  
  /**
   * Convert movement vector to differential drive motor speeds
   */
  vectorToMotors(vx, vy) {
    // Simple differential drive conversion
    // Fix: Invert both forward and rotation to match expected behavior
    const forward = -vy * this.maxMotorSpeed  // Invert forward/backward
    const rotation = -vx * this.maxMotorSpeed * 0.6  // Invert rotation
    
    let left = forward - rotation
    let right = forward + rotation
    
    // Clamp to max speed
    left = Math.max(-this.maxMotorSpeed, Math.min(this.maxMotorSpeed, left))
    right = Math.max(-this.maxMotorSpeed, Math.min(this.maxMotorSpeed, right))
    
    return {
      left: Math.round(left),
      right: Math.round(right)
    }
  }
  
  /**
   * Process D-pad for tilt and gripper control
   * @returns {boolean} True if D-pad input detected
   */
  processDPadServos() {
    const buttons = this.gamepad.buttons
    const now = Date.now()
    
    // Check if enough time passed for next update
    if (now - this.lastServoUpdateTime < this.servoUpdateInterval) {
      return false
    }
    
    let hasInput = false
    
    // D-pad mapping varies by browser/OS, but typically:
    // 12 = up, 13 = down, 14 = left, 15 = right
    
    // Tilt control (up/down)
    if (buttons[12] && buttons[12].pressed) {  // D-pad up
      this.adjustTilt(true)  // Tilt up
      hasInput = true
    } else if (buttons[13] && buttons[13].pressed) {  // D-pad down
      this.adjustTilt(false)  // Tilt down
      hasInput = true
    }
    
    // Gripper control (left/right)
    if (buttons[14] && buttons[14].pressed) {  // D-pad left
      this.adjustGripper(false)  // Close gripper
      hasInput = true
    } else if (buttons[15] && buttons[15].pressed) {  // D-pad right
      this.adjustGripper(true)  // Open gripper
      hasInput = true
    }
    
    if (hasInput) {
      this.lastServoUpdateTime = now
    }
    
    return hasInput
  }
  
  /**
   * Adjust tilt servo
   */
  adjustTilt(up) {
    const tiltSlider = document.getElementById('tiltSlider')
    if (!tiltSlider) return
    
    let currentValue = parseInt(tiltSlider.value)
    const step = up ? this.servoStep : -this.servoStep
    
    // Apply change with bounds checking (1515-1890)
    currentValue = Math.max(1515, Math.min(1890, currentValue + step))
    
    // Update slider and servo
    tiltSlider.value = currentValue
    this.updateSliderValue('tilt', currentValue)
    this.setServoPWM('tilt', currentValue)
  }
  
  /**
   * Adjust gripper servo
   */
  adjustGripper(open) {
    const gripperSlider = document.getElementById('gripperSlider')
    if (!gripperSlider) return
    
    let currentValue = parseInt(gripperSlider.value)
    const step = open ? this.gripperStep : -this.gripperStep  // Use gripperStep (3x)
    
    // Apply change with bounds checking (500-2330)
    currentValue = Math.max(500, Math.min(2330, currentValue + step))
    
    // Update slider and servo
    gripperSlider.value = currentValue
    this.updateSliderValue('gripper', currentValue)
    this.setServoPWM('gripper', currentValue)
  }
  
  /**
   * Process right stick for continuous lift control
   * @returns {boolean} True if lift input detected
   */
  processRightStickLift() {
    const axes = this.gamepad.axes
    const now = Date.now()
    
    // Check if blocked by recent macro
    if (now - this.lastMacroTime < this.macroBlockTime) {
      return false
    }
    
    // Get right stick Y axis (axis 3)
    // Fix: Remove inversion to correct up/down direction
    const liftSpeed = Math.abs(axes[3]) > this.deadZone ? axes[3] : 0
    
    if (Math.abs(liftSpeed) > 0) {
      // Check update interval
      if (now - this.lastServoUpdateTime < this.servoUpdateInterval) {
        return true  // Input detected but not time to update
      }
      
      const liftSlider = document.getElementById('liftSlider')
      if (!liftSlider) return false
      
      let currentValue = parseInt(liftSlider.value)
      const step = Math.round(liftSpeed * this.servoStep)
      
      // Apply change with bounds checking (960-1630)
      currentValue = Math.max(960, Math.min(1630, currentValue + step))
      
      // Update slider and servo
      liftSlider.value = currentValue
      this.updateSliderValue('lift', currentValue)
      this.setServoPWM('lift', currentValue)
      
      this.lastServoUpdateTime = now
      return true
    }
    
    return false
  }
  
  /**
   * Process button macros (A, B, X, Y)
   * A=1 (hold), B=0 (capture), X=3 (lift), Y=2 (grip)
   * @returns {boolean} True if macro triggered
   */
  processButtonMacros() {
    const buttons = this.gamepad.buttons
    let macroTriggered = false
    
    // button (1) = Capture A
    if (this.checkButtonPress(1)) {
      if (this.servoMacros.hold) {
        this.servoMacros.hold()
        macroTriggered = true
      }
    }
    
    // button (3) = lift X
    if (this.checkButtonPress(3)) {
      if (this.servoMacros.lift) {
        this.servoMacros.lift()
        macroTriggered = true
      }
    }
    
    // button (2) = Lift:Y
    if (this.checkButtonPress(2)) {
      if (this.servoMacros.grip) {
        this.servoMacros.grip()
        this.lastMacroTime = Date.now()  // Block continuous lift
        macroTriggered = true
      }
    }
    
    // button (0) = Hold B
    if (this.checkButtonPress(0)) {
      if (this.servoMacros.capture) {
        this.servoMacros.capture()
        macroTriggered = true
      }
    }
    
    // P1 and P2 buttons removed - no longer used
    
    // Update button states for next frame
    this.updateButtonStates()
    
    return macroTriggered
  }
  
  /**
   * Check if button was just pressed (rising edge)
   */
  checkButtonPress(buttonIndex) {
    const button = this.gamepad.buttons[buttonIndex]
    if (!button) return false
    
    const wasPressed = this.prevButtonState[buttonIndex] || false
    const isPressed = button.pressed
    
    return isPressed && !wasPressed
  }
  
  /**
   * Update previous button states
   */
  updateButtonStates() {
    this.gamepad.buttons.forEach((button, index) => {
      this.prevButtonState[index] = button.pressed
    })
  }
  
  /**
   * Emergency stop - halt all movement
   */
  emergencyStop() {
    this.currentVx = 0
    this.currentVy = 0
    
    if (this.stopMovement) {
      this.stopMovement()
    }
  }
  
  /**
   * Update connection status display
   */
  updateConnectionStatus(connected) {
    // Add a simple status indicator if desired
    const statusElement = document.getElementById('gamepad-status')
    if (statusElement) {
      statusElement.textContent = connected ? 'Gamepad Connected' : 'No Gamepad'
      statusElement.style.color = connected ? 'green' : 'gray'
    }
  }
  
  /**
   * Set control parameters
   */
  setParameters(params) {
    if (params.deadZone !== undefined) this.deadZone = params.deadZone
    if (params.maxMotorSpeed !== undefined) this.maxMotorSpeed = params.maxMotorSpeed
    if (params.servoStep !== undefined) this.servoStep = params.servoStep
    if (params.pollRate !== undefined) {
      this.pollRate = params.pollRate
      this.startPolling()  // Restart with new rate
    }
  }
  
  /**
   * Get current gamepad state for debugging
   */
  getState() {
    if (!this.gamepad) {
      return { connected: false }
    }
    
    return {
      connected: true,
      id: this.gamepad.id,
      axes: Array.from(this.gamepad.axes),
      buttons: Array.from(this.gamepad.buttons).map(b => b.pressed),
      movement: { vx: this.currentVx, vy: this.currentVy }
    }
  }
  
  /**
   * Cleanup - stop polling and remove listeners
   */
  destroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    
    window.removeEventListener('gamepadconnected', () => {})
    window.removeEventListener('gamepaddisconnected', () => {})
    
    console.log('GamepadControls: Destroyed')
  }
}

// Export for use in other modules
window.GamepadControls = GamepadControls