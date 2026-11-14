export const simState = {
  ambientTemp: 27.5,
  reefTemp: 27.5,
  deepTemp: 18.5,
  coralHealth: 100.0,
  pumpPWM: 0,           // 0 to 100%
  tds: 35000,           // ppm (seawater baseline)
  turbidity: 4.0,       // NTU
  isContaminated: false,
  statusText: 'STANDBY'
};

export function triggerHeatwave() {
  simState.ambientTemp = 31.8;
}

export function toggleSpill() {
  simState.isContaminated = !simState.isContaminated;
  simState.tds = simState.isContaminated ? 11200 : 35000;
  simState.turbidity = simState.isContaminated ? 68.0 : 4.0;
}

export function resetSim() {
  simState.ambientTemp = 27.5;
  simState.reefTemp = 27.5;
  simState.coralHealth = 100.0;
  simState.isContaminated = false;
  simState.tds = 35000;
  simState.turbidity = 4.0;
}

export function updatePhysics(dt) {
  // 1. Failsafe interlock check (TDS drop or Turbidity > 50 NTU)
  if (simState.isContaminated || simState.turbidity > 50 || simState.tds < 20000) {
    simState.pumpPWM = 0;
    simState.statusText = 'LOCKOUT (HAZARD)';
  } else if (simState.reefTemp >= 29.0) {
    // Proportional PWM scaling between 29°C and 31°C
    const intensity = Math.min(1, (simState.reefTemp - 28.8) / 2.2);
    simState.pumpPWM = Math.round(50 + intensity * 50);
    simState.statusText = `ACTIVE (${simState.pumpPWM}%)`;
  } else if (simState.reefTemp <= 28.4) {
    simState.pumpPWM = 0;
    simState.statusText = 'STANDBY';
  }

  // 2. Heat transfer: Solar warming vs. Cold upwelling mixing
  const kAmbient = 0.25;
  const etaCooling = 0.42;
  const qFlow = simState.pumpPWM / 100;

  const dT =
    kAmbient * (simState.ambientTemp - simState.reefTemp) -
    etaCooling * qFlow * (simState.reefTemp - simState.deepTemp);

  simState.reefTemp += dT * dt;

  // 3. Coral health index (degrades > 30°C, recovers <= 28.5°C)
  if (simState.reefTemp > 30.0) {
    const stress = simState.reefTemp - 30.0;
    simState.coralHealth = Math.max(0, simState.coralHealth - 3.5 * stress * stress * dt);
  } else if (simState.reefTemp <= 28.5 && simState.coralHealth < 100) {
    simState.coralHealth = Math.min(100, simState.coralHealth + 0.8 * dt);
  }
}