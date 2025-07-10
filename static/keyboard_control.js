// Copyright Pololu Corporation.  For more information, see https://www.pololu.com/
// ============================================================================
// KEYBOARD MOVEMENT CONTROLS - COMPLETE VERSION WITH SPEED SWITCHING
// ============================================================================

/**
 * Keyboard movement control module for robot car
 * Handles WASD key bindings for forward/backward/left/right movement
 * Speed switching with [/] keys
 * Updated with servo control mappings and presets
 */

class KeyboardControls {
  constructor() {
    // Remove gripper keys from key state tracking since they're immediate actions
    this.keys_pressed = {
      w: false,
      a: false,
      s: false,
      d: false,
      i: false,           // lift up
      k: false,           // lift down
      ArrowUp: false,     // tilt up
      ArrowDown: false,   // tilt down
      '1': false,         // preset 1
      '2': false,         // preset 2
      '3': false,         // preset 3
      '4': false,         // preset 4
      '5': false,         // preset 5
      '6': false,         // preset 6
      '9': false,          // gripper open only
      '0': false           // gripper close only
      // Note: '[', ']', '-' and '=' keys are immediate actions
    }
    
    // Movement parameters
    this.base_strength = 300  // Base motor strength for keyboard controls
    this.rotation_factor = 0.6  // Factor for rotation strength relative to forward/backward
    
    // Speed switching - matches robot_button.py speed levels
    this.speed_levels = ["slow", "moderate", "fast"]
    this.current_speed_index = 2  // Start with "fast" (index 2)
    
    // Servo control parameters
    this.servo_step = 20  // PWM step size for servo adjustments
    this.servo_update_interval = 100  // Milliseconds between servo updates
    this.last_servo_update = 0
    this.servo_timer = null  // Timer for continuous servo updates
    
    // PWM ranges for each servo (from your C++ code)
    this.pwm_ranges = {
      lift: { min: 960, max: 1630, mid: 1350 },
      tilt: { min: 1400, max: 1900, mid: 1700 },
      gripper: { min: 500, max: 2330, mid: 1440 }
    }
    
    // Preset actions configuration - includes all servo positions and sequences
    this.presets = {
      '1': { name: 'Ready To Push Box', type: 'simple', lift: 960, tilt: 1890, gripper: 500 },
      '2': { name: 'Quick Press Key', type: 'sequence', sequence: [
        { delay: 0, lift: 960, tilt: 1515, gripper: 2330 },
        { delay: 500, lift: 1400, tilt: null, gripper: null },
        { delay: 500, lift: 1200, tilt: null, gripper: null },
        { delay: 500, lift: 1400, tilt: null, gripper: null },
        { delay: 500, lift: 1200, tilt: null, gripper: null },
        { delay: 500, lift: 1400, tilt: null, gripper: null },
        { delay: 500, lift: 1200, tilt: null, gripper: null }
      ]},
      '3': { name: 'Pickup Grasp', type: 'simple', lift: 1000, tilt: 1400, gripper: 2330 },
      '4': { name: 'Lift Object', type: 'simple', lift: 1400, tilt: 1400, gripper: 2330 },
      '5': { name: 'High Position', type: 'simple', lift: 1600, tilt: 1400, gripper: 2330 },
      '6': { name: 'Drop Position', type: 'simple', lift: 1200, tilt: 1400, gripper: 500 },
      '7': { name: 'Locate The Capture', type: 'simple', lift: 1200, tilt: 1400, gripper: 500 },
      '8': { name: 'Ready To Capture', type: 'simple', lift: 1630, tilt: 1400, gripper: 500 },
      '9': { name: 'Try To Pick', type: 'sequence', sequence: [
        { delay: 0, lift: null, tilt: null, gripper: 2330 },
        { delay: 500, lift: 1200, tilt: null, gripper: null }
      ]},
      '0': { name: 'Default Just Hold', type: 'simple', lift: 1100, tilt: 1890, gripper: null },
      // Single servo presets
      'i': { name: 'Lift Highest', type: 'simple', lift: 960, tilt: null, gripper: null },
      'j': { name: 'Lift Middle', type: 'simple', lift: 1350, tilt: null, gripper: null },
      'n': { name: 'Lift Lowest', type: 'simple', lift: 1630, tilt: null, gripper: null },
      'u': { name: 'Tilt Highest', type: 'simple', lift: null, tilt: 1890, gripper: null },
      'h': { name: 'Tilt Middle', type: 'simple', lift: null, tilt: 1580, gripper: null },
      'b': { name: 'Tilt Lowest', type: 'simple', lift: null, tilt: 1515, gripper: null },
      '-': { name: 'Close Gripper Only', type: 'simple', lift: null, tilt: null, gripper: 2330 },
      '=': { name: 'Open Gripper Only', type: 'simple', lift: null, tilt: null, gripper: 500 }
    }
    
    // External dependencies (to be injected)
    this.setMotors = null
    this.isSystemPaused = null
    this.stopMovement = null
    this.setServoPWM = null
    this.updateSliderValue = null
    this.setSpeed = null  // Function to set speed on server
    
    this.initialized = false
  }
  
  /**
   * Initialize keyboard controls with required dependencies
   * @param {Object} dependencies - Required external functions
   * @param {Function} dependencies.setMotors - Function to set motor speeds (left, right)
   * @param {Function} dependencies.isSystemPaused - Function that returns pause state
   * @param {Function} dependencies.stopMovement - Function to stop all movement
   * @param {Function} dependencies.setServoPWM - Function to set servo PWM (servo, value)
   * @param {Function} dependencies.updateSliderValue - Function to update slider display (servo, value)
   * @param {Function} dependencies.setSpeed - Function to set speed level on server
   */
  init(dependencies) {
    if (!dependencies.setMotors || !dependencies.isSystemPaused || !dependencies.stopMovement ||
        !dependencies.setServoPWM || !dependencies.updateSliderValue) {
      console.error('KeyboardControls: Missing required dependencies')
      return false
    }
    
    this.setMotors = dependencies.setMotors
    this.isSystemPaused = dependencies.isSystemPaused
    this.stopMovement = dependencies.stopMovement
    this.setServoPWM = dependencies.setServoPWM
    this.updateSliderValue = dependencies.updateSliderValue
    this.setSpeed = dependencies.setSpeed || this.defaultSetSpeed
    
    this.bindEvents()
    this.initialized = true
    
    console.log('KeyboardControls: Initialized successfully with direct speed control')
    console.log('Controls: WASD=move, [=slow, }=moderate, \\=fast, I/J/N=lift, U/H/B=tilt, -=close/=open, 0-9=presets')
    return true
  }
  
  /**
   * Default setSpeed function if not provided
   */
  defaultSetSpeed(level) {
    console.warn('KeyboardControls: setSpeed function not provided, using AJAX fallback')
    $.ajax({url: "set_speed/" + level})
  }
  
  /**
   * Bind keyboard event listeners
   */
  bindEvents() {
    $(document).on("keydown", (e) => this.handleKeyDown(e))
    $(document).on("keyup", (e) => this.handleKeyUp(e))
  }
  
  /**
   * Handle keydown events
   * @param {Event} e - Keyboard event
   */
  handleKeyDown(e) {
    // Skip keyboard controls if user is typing in text input fields, but allow sliders
    if ($(e.target).is('input[type="text"], input[type="password"], input[type="email"], textarea, select')) {
      return
    }
    
    const key = e.key
    
    // Handle speed switching keys - direct speed selection
    if (key === '[') {
      if (!this.isSystemPaused()) {
        this.setSpeedDirect('slow')
      }
      e.preventDefault()
      return
    }
    
    if (key === ']') {
      if (!this.isSystemPaused()) {
        this.setSpeedDirect('moderate')
      }
      e.preventDefault()
      return
    }
    
    if (key === '\\') {
      if (!this.isSystemPaused()) {
        this.setSpeedDirect('fast')
      }
      e.preventDefault()
      return
    }
    
    // Handle all preset keys - immediate actions, not held
    if (['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'i', 'j', 'n', 'u', 'h', 'b', '-', '='].includes(key)) {
      if (!this.isSystemPaused()) {
        this.executePreset(key)
      }
      e.preventDefault()
      return
    }
    
    // Handle other keys - only movement keys now use gradual control
    if (key in this.keys_pressed && !this.keys_pressed[key]) {
      this.keys_pressed[key] = true
      
      if (!this.isSystemPaused()) {
        // Handle movement keys - only WASD remain for gradual control
        if (['w', 'a', 's', 'd'].includes(key)) {
          this.updateMovementFromKeys()
        }
      }
      e.preventDefault()
    }
  }
  
  /**
   * Handle keyup events
   * @param {Event} e - Keyboard event
   */
  handleKeyUp(e) {
    // Skip keyboard controls if user is typing in text input fields, but allow sliders
    if ($(e.target).is('input[type="text"], input[type="password"], input[type="email"], textarea, select')) {
      return
    }
    
    const key = e.key
    
    // Ignore speed switching and preset keys for keyup
    if (['[', ']', '\\', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'i', 'j', 'n', 'u', 'h', 'b', '-', '='].includes(key)) {
      return
    }
    
    if (key in this.keys_pressed && this.keys_pressed[key]) {
      this.keys_pressed[key] = false
      
      // Handle movement keys - only WASD remain for gradual control
      if (['w', 'a', 's', 'd'].includes(key)) {
        this.updateMovementFromKeys()
      }
      
      e.preventDefault()
    }
  }
  
  /**
   * Set speed directly to a specific level
   * @param {string} speedLevel - Target speed level ('slow', 'moderate', 'fast')
   */
  setSpeedDirect(speedLevel) {
    if (!this.speed_levels.includes(speedLevel)) {
      console.warn(`KeyboardControls: Invalid speed level: ${speedLevel}`)
      return
    }
    
    // Update internal speed index
    this.current_speed_index = this.speed_levels.indexOf(speedLevel)
    
    // Set speed on server
    this.setSpeed(speedLevel)
    
    // Show feedback
    const keyMap = { slow: '[ (Slow)', moderate: '] (Moderate)', fast: '\\ (Fast)' }
    this.showSpeedFeedback(speedLevel, keyMap[speedLevel])
    
    console.log(`KeyboardControls: Speed set directly to ${speedLevel}`)
  }
  
  /**
   * Show speed change feedback
   * @param {string} speedLevel - Current speed level
   * @param {string} action - Action description
   */
  showSpeedFeedback(speedLevel, action) {
    // Create a temporary speed status message
    const statusMsg = $(`<div class="speed-feedback">Speed: ${speedLevel.toUpperCase()} ${action}</div>`)
    statusMsg.css({
      position: 'fixed',
      top: '60px',  // Below preset feedback
      right: '20px',
      background: '#2196F3',  // Blue color for speed
      color: 'white',
      padding: '10px 20px',
      borderRadius: '5px',
      zIndex: 1000,
      fontSize: '14px',
      fontWeight: 'bold'
    })
    
    $('body').append(statusMsg)
    
    // Remove after 2 seconds
    setTimeout(() => {
      statusMsg.fadeOut(300, () => statusMsg.remove())
    }, 2000)
  }
  
  /**
   * Sync with external speed changes (called from script.js when speed buttons are clicked)
   * @param {string} speedLevel - New speed level from server
   */
  syncSpeedLevel(speedLevel) {
    const index = this.speed_levels.indexOf(speedLevel)
    if (index !== -1) {
      this.current_speed_index = index
      console.log(`KeyboardControls: Speed synced to ${speedLevel}`)
    }
  }
  
  /**
   * Get current speed level
   * @returns {string} Current speed level
   */
  getCurrentSpeed() {
    return this.speed_levels[this.current_speed_index]
  }
  
  /**
   * Execute a preset action
   * @param {string} presetKey - The preset key (1-9, 0, i, j, n, u, h, b, -, =)
   */
  executePreset(presetKey) {
    if (!this.initialized) {
      console.warn('KeyboardControls: Not initialized')
      return
    }
    
    const preset = this.presets[presetKey]
    if (!preset) {
      console.warn(`KeyboardControls: Invalid preset key: ${presetKey}`)
      return
    }
    
    console.log(`KeyboardControls: Executing preset ${presetKey}: ${preset.name}`)
    
    // Get slider elements
    const liftSlider = document.getElementById('liftSlider')
    const tiltSlider = document.getElementById('tiltSlider')
    const gripperSlider = document.getElementById('gripperSlider')
    
    if (!liftSlider || !tiltSlider || !gripperSlider) {
      console.warn('KeyboardControls: Slider elements not found')
      return
    }
    
    if (preset.type === 'simple') {
      // Simple preset - immediate servo positions
      if (preset.lift !== null && preset.lift !== undefined) {
        liftSlider.value = preset.lift
        this.updateSliderValue('lift', preset.lift)
        this.setServoPWM('lift', preset.lift)
      }
      
      if (preset.tilt !== null && preset.tilt !== undefined) {
        tiltSlider.value = preset.tilt
        this.updateSliderValue('tilt', preset.tilt)
        this.setServoPWM('tilt', preset.tilt)
      }
      
      if (preset.gripper !== null && preset.gripper !== undefined) {
        gripperSlider.value = preset.gripper
        this.updateSliderValue('gripper', preset.gripper)
        this.setServoPWM('gripper', preset.gripper)
      }
    } else if (preset.type === 'sequence') {
      // Sequence preset - execute steps with delays
      this.executeSequence(preset.sequence)
    }
    
    // Show feedback to user
    this.showPresetFeedback(presetKey, preset.name)
  }
  
  /**
   * Execute a sequence of servo movements
   * @param {Array} sequence - Array of movement steps
   */
  executeSequence(sequence) {
    const liftSlider = document.getElementById('liftSlider')
    const tiltSlider = document.getElementById('tiltSlider')
    const gripperSlider = document.getElementById('gripperSlider')
    
    sequence.forEach((step, index) => {
      setTimeout(() => {
        if (step.lift !== null && step.lift !== undefined) {
          liftSlider.value = step.lift
          this.updateSliderValue('lift', step.lift)
          this.setServoPWM('lift', step.lift)
        }
        
        if (step.tilt !== null && step.tilt !== undefined) {
          tiltSlider.value = step.tilt
          this.updateSliderValue('tilt', step.tilt)
          this.setServoPWM('tilt', step.tilt)
        }
        
        if (step.gripper !== null && step.gripper !== undefined) {
          gripperSlider.value = step.gripper
          this.updateSliderValue('gripper', step.gripper)
          this.setServoPWM('gripper', step.gripper)
        }
      }, step.delay)
    })
  }
  
  /**
   * Show feedback when preset is executed
   * @param {string} presetKey - The preset key
   * @param {string} presetName - The preset name
   */
  showPresetFeedback(presetKey, presetName) {
    // Create a temporary status message
    const statusMsg = $(`<div class="preset-feedback">Preset ${presetKey}: ${presetName}</div>`)
    statusMsg.css({
      position: 'fixed',
      top: '20px',
      right: '20px',
      background: '#4CAF50',
      color: 'white',
      padding: '10px 20px',
      borderRadius: '5px',
      zIndex: 1000,
      fontSize: '14px',
      fontWeight: 'bold'
    })
    
    $('body').append(statusMsg)
    
    // Remove after 2 seconds
    setTimeout(() => {
      statusMsg.fadeOut(300, () => statusMsg.remove())
    }, 2000)
  }
  
  /**
   * Update motor movement based on currently pressed keys
   * Now uses server endpoints to respect speed settings
   */
  updateMovementFromKeys() {
    if (!this.initialized) {
      console.warn('KeyboardControls: Not initialized')
      return
    }

    const forward = this.keys_pressed.w
    const backward = this.keys_pressed.s
    const left = this.keys_pressed.a
    const right = this.keys_pressed.d

    // Check if any movement key is pressed
    if (!forward && !backward && !left && !right) {
      this.stopMovement()
      return
    }

    // If paused, stop movement
    if (this.isSystemPaused()) {
      this.stopMovement()
      return
    }

    // Determine movement type and call appropriate server endpoint
    // Priority: Forward/backward first, then rotation
    if (forward && !backward) {
      if (left && !right) {
        // Forward + Left = Forward with left bias (use joystick for this)
        this.setMotorsWithSpeedFactor(150, 50)
      } else if (right && !left) {
        // Forward + Right = Forward with right bias (use joystick for this)  
        this.setMotorsWithSpeedFactor(50, 150)
      } else {
        // Pure forward
        $.ajax({url: "move_forward"})
      }
    } else if (backward && !forward) {
      if (left && !right) {
        // Backward + Left = Backward with left bias (use joystick for this)
        this.setMotorsWithSpeedFactor(-150, -50)
      } else if (right && !left) {
        // Backward + Right = Backward with right bias (use joystick for this)
        this.setMotorsWithSpeedFactor(-50, -150)
      } else {
        // Pure backward
        $.ajax({url: "move_backward"})
      }
    } else if (left && !right) {
      // Pure left rotation
      $.ajax({url: "rotate_left"})
    } else if (right && !left) {
      // Pure right rotation
      $.ajax({url: "rotate_right"})
    }
  }

  /**
   * Helper function for complex movements that need joystick-style control
   * This respects the current speed setting by applying the same factors as robot_button.py
   */
  setMotorsWithSpeedFactor(leftBase, rightBase) {
    // Get current speed factor (matches robot_button.py constants)
    let speedFactor
    const currentSpeed = this.speed_levels[this.current_speed_index]
    switch(currentSpeed) {
      case "slow":
        speedFactor = 0.3
        break
      case "moderate":
        speedFactor = 0.5
        break
      case "fast":
      default:
        speedFactor = 0.9
        break
    }
    
    const leftAdjusted = Math.round(leftBase * speedFactor)
    const rightAdjusted = Math.round(rightBase * speedFactor)
    
    this.setMotors(leftAdjusted, rightAdjusted)
  }
  
  /**
   * Calculate motor speeds based on key states
   * @param {boolean} forward - W key pressed
   * @param {boolean} backward - S key pressed
   * @param {boolean} left - A key pressed
   * @param {boolean} right - D key pressed
   * @returns {Object} Motor speeds {left, right}
   */
  calculateMotorSpeeds(forward, backward, left, right) {
    let left_motor = 0
    let right_motor = 0
    
    // Get speed factor based on current speed setting (matches robot_button.py)
    let speedFactor
    const currentSpeed = this.speed_levels[this.current_speed_index]
    switch(currentSpeed) {
      case "slow":
        speedFactor = 0.3
        break
      case "moderate":
        speedFactor = 0.5
        break
      case "fast":
      default:
        speedFactor = 0.9
        break
    }
    
    // Apply speed factor to base strength
    const adjustedStrength = Math.round(this.base_strength * speedFactor)
    const adjustedRotation = Math.round(this.base_strength * this.rotation_factor * speedFactor)
    
    // Forward/backward movement
    if (forward && !backward) {
      left_motor += adjustedStrength
      right_motor += adjustedStrength
    } else if (backward && !forward) {
      left_motor -= adjustedStrength
      right_motor -= adjustedStrength
    }
    
    // Left/right rotation (can combine with forward/backward)
    if (left && !right) {
      left_motor -= adjustedRotation
      right_motor += adjustedRotation
    } else if (right && !left) {
      left_motor += adjustedRotation
      right_motor -= adjustedRotation
    }
    
    // Limit motor values to valid range (-400 to 400, matching joystick)
    left_motor = Math.max(-400, Math.min(400, left_motor))
    right_motor = Math.max(-400, Math.min(400, right_motor))
    
    return {
      left: Math.round(left_motor),
      right: Math.round(right_motor)
    }
  }
  
  /**
   * Get current key states
   * @returns {Object} Current key states
   */
  getKeyStates() {
    return { ...this.keys_pressed }
  }
  
  /**
   * Get preset configurations
   * @returns {Object} Preset configurations
   */
  getPresets() {
    return { ...this.presets }
  }
  
  /**
   * Update a preset configuration
   * @param {string} presetKey - Preset key (1-9, 0, etc.)
   * @param {Object} preset - Preset configuration
   */
  updatePreset(presetKey, preset) {
    if (presetKey in this.presets) {
      this.presets[presetKey] = { ...preset }
      console.log(`KeyboardControls: Updated preset ${presetKey}: ${preset.name}`)
    }
  }
  
  /**
   * Set movement and servo parameters
   * @param {Object} params - Parameters
   * @param {number} params.baseStrength - Base motor strength
   * @param {number} params.rotationFactor - Rotation strength factor
   * @param {number} params.servoStep - PWM step size for servo adjustments
   * @param {number} params.servoUpdateInterval - Milliseconds between servo updates
   */
  setParameters(params) {
    if (params.baseStrength !== undefined) {
      this.base_strength = params.baseStrength
    }
    if (params.rotationFactor !== undefined) {
      this.rotation_factor = params.rotationFactor
    }
    if (params.servoStep !== undefined) {
      this.servo_step = params.servoStep
    }
    if (params.servoUpdateInterval !== undefined) {
      this.servo_update_interval = params.servoUpdateInterval
    }
  }
  
  /**
   * Emergency stop - immediately stop all movement and reset keys
   */
  emergencyStop() {
    // Reset movement key states only
    this.keys_pressed.w = false
    this.keys_pressed.a = false
    this.keys_pressed.s = false
    this.keys_pressed.d = false
    
    // Stop movement
    if (this.stopMovement) {
      this.stopMovement()
    }
  }
  
  /**
   * Cleanup - remove event listeners and stop timers
   */
  destroy() {
    // Remove event listeners
    $(document).off("keydown keyup")
    this.initialized = false
    console.log('KeyboardControls: Destroyed')
  }
}

// Export for use in other modules
window.KeyboardControls = KeyboardControls