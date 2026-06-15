// Glow Slider - Configuration
const CONFIG = {
  minValue: 20,
  maxValue: 100,
  initialValue: 50,
  lineX: null, // Will be calculated based on viewport
  bulgeAmount: 40, // How far the line bends outward (to the left)
  bendRadius: 80, // Vertical distance of the bend zone
  majorTickInterval: 5, // Major ticks every 10 units
};

// State
let currentValue = CONFIG.initialValue;
let previousValue = CONFIG.initialValue;
let isDragging = false;
let sliderHeight = 0;
let sliderTop = 0;
let currentButtonY = 0;

// Momentum/elastic physics state
let lastY = 0;
let lastTime = 0;
let velocity = 0;
let currentY = 0; // Continuous Y position for smooth animation
let animationId = null;
const friction = 0.94; // How quickly velocity decays
const bounceFriction = 0.6; // Energy retained after bounce
const springStrength = 0.15; // How strongly it pulls back from edges
const minVelocity = 0.3; // Stop animation when velocity is below this
const minDisplacement = 0.5; // Stop when displacement from bounds is minimal

// Audio
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playTick() {
  if (!audioCtx) return;

  // Resume audio context if suspended (browser autoplay policy)
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.frequency.value = 1800;
  oscillator.type = "sine";

  gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.001,
    audioCtx.currentTime + 0.04,
  );

  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + 0.04);
}

// DOM Elements
const sliderSvg = document.getElementById("sliderSvg");
const sliderLine = document.getElementById("sliderLine");
const sliderButton = document.getElementById("sliderButton");
const valueDisplay = document.getElementById("valueDisplay");
const glowCircle = document.getElementById("glowCircle");
const glowMaskCircle = document.getElementById("glowMaskCircle");
const tickMarksGroup = document.getElementById("tickMarks");
const labelsContainer = document.getElementById("labels");

// Cached elements for smooth transitions
let tickElements = [];
let labelElements = [];

// Initialize
function init() {
  calculateDimensions();
  createTickMarks();
  createLabels();
  updateSlider();
  setupEventListeners();
  window.addEventListener("resize", onResize);
}

// Create tick mark elements once
function createTickMarks() {
  tickMarksGroup.innerHTML = "";
  tickElements = [];

  for (let value = CONFIG.minValue; value <= CONFIG.maxValue; value += 2) {
    const isMajor = value % CONFIG.majorTickInterval === 0;
    const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
    tick.setAttribute("class", `tick-mark ${isMajor ? "major" : ""}`);
    tick.dataset.value = value;
    tickMarksGroup.appendChild(tick);
    tickElements.push({ element: tick, value, isMajor });
  }
}

// Create label elements once
function createLabels() {
  labelsContainer.innerHTML = "";
  labelElements = [];

  for (
    let value = CONFIG.minValue;
    value <= CONFIG.maxValue;
    value += CONFIG.majorTickInterval
  ) {
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = value;
    label.style.position = "absolute";
    labelsContainer.appendChild(label);
    labelElements.push({ element: label, value });
  }
}

function calculateDimensions() {
  const rect = sliderSvg.getBoundingClientRect();
  sliderHeight = rect.height;
  sliderTop = 10; // padding
  CONFIG.lineX = rect.width / 2 + 60; // Position line right of center
}

function valueToY(value) {
  const usableHeight = sliderHeight - 20;
  const ratio = (value - CONFIG.minValue) / (CONFIG.maxValue - CONFIG.minValue);
  return sliderTop + usableHeight * (1 - ratio);
}

function yToValue(y) {
  const usableHeight = sliderHeight - 20;
  const ratio = 1 - (y - sliderTop) / usableHeight;
  const value = CONFIG.minValue + ratio * (CONFIG.maxValue - CONFIG.minValue);
  return Math.round(
    Math.max(CONFIG.minValue, Math.min(CONFIG.maxValue, value)),
  );
}

// Calculate how much the line is displaced at a given Y position
function getDisplacement(y, buttonY) {
  const radius = CONFIG.bendRadius;
  const distance = Math.abs(y - buttonY);

  if (distance >= radius) {
    return 0;
  }

  // Smooth curve using cosine for natural falloff
  const t = distance / radius;
  const displacement = CONFIG.bulgeAmount * Math.cos((t * Math.PI) / 2);
  return displacement;
}

function generateBendingPath(buttonY) {
  const x = CONFIG.lineX;
  const top = sliderTop;
  const bottom = sliderHeight - sliderTop;
  const bulge = CONFIG.bulgeAmount;
  const radius = CONFIG.bendRadius;

  // Calculate bend zone
  const bendStart = Math.max(top, buttonY - radius);
  const bendEnd = Math.min(bottom, buttonY + radius);
  const peakX = x - bulge; // Curve to the LEFT

  // Control point offsets for smooth curve
  const cp = radius * 0.48;

  // Build the path
  let path = `M ${x} ${top}`;
  path += ` L ${x} ${bendStart}`;
  path += ` C ${x} ${bendStart + cp}, ${peakX} ${buttonY - cp}, ${peakX} ${buttonY}`;
  path += ` C ${peakX} ${buttonY + cp}, ${x} ${bendEnd - cp}, ${x} ${bendEnd}`;
  path += ` L ${x} ${bottom}`;

  return path;
}

function updateTickMarks(buttonY) {
  const x = CONFIG.lineX;
  const tickLength = 12;
  const minorTickLength = 6;
  const gap = 8;

  for (const { element, value, isMajor } of tickElements) {
    const y = valueToY(value);
    const len = isMajor ? tickLength : minorTickLength;

    // Calculate displacement at this Y position
    const displacement = getDisplacement(y, buttonY);
    const tickX = x - displacement;

    element.setAttribute("x1", tickX - gap - len);
    element.setAttribute("y1", y);
    element.setAttribute("x2", tickX - gap);
    element.setAttribute("y2", y);
  }
}

function updateLabels(buttonY) {
  const x = CONFIG.lineX;
  const tickLength = 12;
  const gap = 8;
  const baseFontSize = 24;
  const maxFontIncrease = 0.2; // 20% increase

  for (const { element, value } of labelElements) {
    const y = valueToY(value);

    // Calculate displacement at this Y position
    const displacement = getDisplacement(y, buttonY);
    const labelX = x - displacement - gap - tickLength - 15;

    // Calculate the displacement ratio (0 to 1, where 1 is max displacement)
    const displacementRatio = displacement / CONFIG.bulgeAmount;

    // Calculate font size: increase by up to 20% based on displacement
    const fontSize = baseFontSize * (1 + maxFontIncrease * displacementRatio);

    // Interpolate color from #888 to #fcfcfc based on displacement
    // #888 = rgb(136, 136, 136), #fcfcfc = rgb(252, 252, 252)
    const baseColor = 136;
    const targetColor = 252;
    const colorValue = Math.round(
      baseColor + (targetColor - baseColor) * displacementRatio,
    );
    const color = `rgb(${colorValue}, ${colorValue}, ${colorValue})`;

    element.style.left = `${labelX - 40}px`;
    element.style.top = `${y}px`;
    element.style.fontSize = `${fontSize}px`;
    element.style.color = color;

    // Add glow effect for displaced labels
    if (displacementRatio > 0) {
      const glowIntensity = displacementRatio * 0.4;
      element.style.textShadow = `0 0 ${10 * displacementRatio}px rgba(252, 252, 252, ${glowIntensity})`;
    } else {
      element.style.textShadow = "none";
    }
  }
}

function updateSlider() {
  const buttonY = valueToY(currentValue);
  currentButtonY = buttonY;

  // Update the bending line path
  const path = generateBendingPath(buttonY);
  sliderLine.setAttribute("d", path);

  // Update tick marks and labels to follow the curve
  updateTickMarks(buttonY);
  updateLabels(buttonY);

  // Position the button on the RIGHT side (fixed X, the line bends away from it)
  const buttonX = CONFIG.lineX + 10;
  sliderButton.style.left = `${buttonX - 32}px`;
  sliderButton.style.top = `${buttonY - 32}px`;

  // Position the glow circle at the curve peak
  const glowX = CONFIG.lineX - CONFIG.bulgeAmount;
  glowCircle.setAttribute("cx", glowX);
  glowCircle.setAttribute("cy", buttonY);

  // Position the mask circle to match the glow
  glowMaskCircle.setAttribute("cx", glowX);
  glowMaskCircle.setAttribute("cy", buttonY);

  // Position and update value display (right of button)
  valueDisplay.style.left = `${buttonX + 50}px`;
  valueDisplay.style.top = `${buttonY - 60}px`;
  valueDisplay.textContent = currentValue;
}

function setupEventListeners() {
  sliderButton.addEventListener("mousedown", startDrag);
  document.addEventListener("mousemove", onDrag);
  document.addEventListener("mouseup", endDrag);

  sliderButton.addEventListener("touchstart", startDrag, { passive: false });
  document.addEventListener("touchmove", onDrag, { passive: false });
  document.addEventListener("touchend", endDrag);

  // Global keyboard listener for arrow keys
  document.addEventListener("keydown", onKeyDown);
}

function startDrag(e) {
  e.preventDefault();
  isDragging = true;
  sliderButton.classList.add("dragging");
  valueDisplay.classList.add("dragging");
  sliderLine.classList.add("dragging");
  glowCircle.classList.add("dragging");
  glowMaskCircle.classList.add("dragging");
  initAudio();

  // Cancel any ongoing momentum animation
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // Initialize tracking
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const rect = sliderSvg.getBoundingClientRect();
  lastY = clientY - rect.top;
  lastTime = performance.now();
  velocity = 0;
}

function onDrag(e) {
  if (!isDragging) return;
  e.preventDefault();

  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const rect = sliderSvg.getBoundingClientRect();
  const y = clientY - rect.top;

  // Calculate velocity
  const now = performance.now();
  const dt = now - lastTime;
  if (dt > 0) {
    velocity = ((y - lastY) / dt) * 16; // Normalize to ~60fps
  }
  lastY = y;
  lastTime = now;

  currentValue = yToValue(y);

  // Play tick sound when value changes
  if (currentValue !== previousValue) {
    playTick();
    previousValue = currentValue;
  }

  updateSlider();
}

function endDrag() {
  if (!isDragging) return;
  isDragging = false;
  sliderButton.classList.remove("dragging");
  valueDisplay.classList.remove("dragging");
  sliderLine.classList.remove("dragging");
  glowCircle.classList.remove("dragging");
  glowMaskCircle.classList.remove("dragging");

  // Initialize continuous Y position for animation
  currentY = valueToY(currentValue);

  // Start momentum animation if there's velocity
  if (Math.abs(velocity) > minVelocity) {
    animateMomentum();
  }
}

function animateMomentum() {
  // Calculate bounds
  const minY = valueToY(CONFIG.maxValue); // Top of slider (max value)
  const maxY = valueToY(CONFIG.minValue); // Bottom of slider (min value)

  // Apply velocity
  currentY += velocity;

  // Apply spring force if beyond bounds (creates bounce)
  let beyondBounds = false;
  if (currentY < minY) {
    // Beyond top - spring back
    const overshot = minY - currentY;
    velocity += overshot * springStrength;
    beyondBounds = true;
  } else if (currentY > maxY) {
    // Beyond bottom - spring back
    const overshot = currentY - maxY;
    velocity -= overshot * springStrength;
    beyondBounds = true;
  }

  // Apply friction (more friction when bouncing)
  velocity *= beyondBounds ? bounceFriction : friction;

  // Clamp Y for value calculation but allow visual overshoot
  const clampedY = Math.max(minY, Math.min(maxY, currentY));
  const newValue = yToValue(clampedY);

  // Play tick and update if value changed
  if (newValue !== currentValue) {
    currentValue = newValue;
    playTick();
    previousValue = currentValue;
  }

  // Update visual (use currentY for smooth animation including overshoot)
  updateSliderWithY(currentY);

  // Check if animation should continue
  const displacement = beyondBounds ? Math.abs(currentY - clampedY) : 0;
  const shouldContinue =
    Math.abs(velocity) > minVelocity || displacement > minDisplacement;

  if (shouldContinue) {
    animationId = requestAnimationFrame(animateMomentum);
  } else {
    // Snap to final position
    currentY = valueToY(currentValue);
    updateSlider();
    animationId = null;
  }
}

// Update slider visuals with a specific Y position (for smooth animation)
function updateSliderWithY(buttonY) {
  // Update the bending line path
  const path = generateBendingPath(buttonY);
  sliderLine.setAttribute("d", path);

  // Update tick marks and labels to follow the curve
  updateTickMarks(buttonY);
  updateLabels(buttonY);

  // Position the button
  const buttonX = CONFIG.lineX + 10;
  sliderButton.style.left = `${buttonX - 32}px`;
  sliderButton.style.top = `${buttonY - 32}px`;

  // Position the glow circle at the curve peak
  const glowX = CONFIG.lineX - CONFIG.bulgeAmount;
  glowCircle.setAttribute("cx", glowX);
  glowCircle.setAttribute("cy", buttonY);

  // Position the mask circle to match the glow
  glowMaskCircle.setAttribute("cx", glowX);
  glowMaskCircle.setAttribute("cy", buttonY);

  // Position and update value display
  valueDisplay.style.left = `${buttonX + 50}px`;
  valueDisplay.style.top = `${buttonY - 60}px`;
  valueDisplay.textContent = currentValue;
}

function onKeyDown(e) {
  let delta = 0;

  switch (e.key) {
    case "ArrowUp":
    case "ArrowRight":
      delta = 1;
      break;
    case "ArrowDown":
    case "ArrowLeft":
      delta = -1;
      break;
    case "PageUp":
      delta = 10;
      break;
    case "PageDown":
      delta = -10;
      break;
    default:
      return;
  }

  e.preventDefault();
  initAudio();

  const newValue = Math.max(
    CONFIG.minValue,
    Math.min(CONFIG.maxValue, currentValue + delta),
  );

  if (newValue !== currentValue) {
    currentValue = newValue;
    playTick();
    previousValue = currentValue;
    updateSlider();
  }
}

function onResize() {
  calculateDimensions();
  updateSlider();
}

// Start the slider
init();
