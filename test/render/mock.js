// Mock-hass aus den Live-Werten der Alt-Instanz vom 2026-11-02 (ha_eval_template), fuer den Rendertest.
// Varianten ueber URL-Parameter: bal=<pack> setzt Balancing an diesem Pack, err=<pack> setzt einen Fehlertext,
// em=<pack> schaltet Emergency an, off=<pack> laesst das Pack ohne frische Daten.
(function () {
  const q = new URLSearchParams(location.search);
  const now = Date.now();
  const iso = (agoS) => new Date(now - agoS * 1000).toISOString();
  const states = {};
  const put = (id, state, unit = '', attrs = {}, ago = 5) => {
    states[id] = {
      entity_id: id,
      state: String(state),
      attributes: Object.assign(unit ? { unit_of_measurement: unit } : {}, attrs),
      last_updated: iso(ago),
    };
  };
  const B = 'sensor.victron_mqtt_battery_279_battery_';
  const M = 'sensor.victron_mqtt_battery_512_battery_';
  put(B + 'voltage', 53.78, 'V');
  put(B + 'current', 31.1, 'A');
  put(B + 'power', 1672.6, 'W');
  put(B + 'soc', 90.3, '%');
  put(B + 'consumed_amphours', -166.9, 'Ah');
  put(B + 'time_to_go', 'unavailable', 's');
  put(M + 'installed_capacity', 1680, 'Ah');
  put(M + 'soh', 100, '%');
  put(M + 'max_cell_voltage', 3.362, 'V');
  put(M + 'min_cell_voltage', 3.356, 'V');
  put(M + 'max_voltage_cell_id', '06::02');
  put(M + 'min_voltage_cell_id', '05::08');
  put(M + 'max_cell_temperature', 21.0, '°C');
  put(M + 'max_temperature_cell_id', '04::02');
  put(M + 'nr_modules_online', 6, 'modules');
  put(M + 'nr_modules_offline', 0, 'modules');
  put(M + 'nr_modules_blocking_charge', 0, 'modules');
  put(M + 'nr_modules_blocking_discharge', 0, 'modules');
  for (const a of ['cell_imbalance', 'low_charge_temperature', 'high_charge_temperature', 'high_charge_current', 'high_discharge_current', 'internal_failure'])
    put(M + a, 'no_alarm', '', { options: ['no_alarm', 'warning', 'alarm'] });

  const P = {
    1: { soc: 95, u: 53.751, i: 5.107, p: 274.5, mos: 21.6, t: [20.7, 21.2, 21.0, 21.2], dv: 0.003, avg: 3.35931, min: 8, max: 3, cyc: 39, thr: 11020, rssi: -75, pon: 13,
      cv: [3.359, 3.359, 3.36, 3.36, 3.359, 3.36, 3.359, 3.357, 3.36, 3.36, 3.359, 3.359, 3.359, 3.36, 3.36, 3.359],
      cr: [82, 78, 85, 82, 85, 82, 87, 87, 92, 90, 92, 84, 85, 81, 84, 78] },
    2: { soc: 93, u: 53.743, i: 4.94, p: 265.5, mos: 22.6, t: [20.4, 21.1, 20.6, 20.8], dv: 0.001, avg: 3.35844, min: 1, max: 4, cyc: 43, thr: 12082, rssi: -68, pon: 12,
      cv: [3.358, 3.358, 3.358, 3.359, 3.358, 3.359, 3.358, 3.359, 3.359, 3.358, 3.358, 3.359, 3.358, 3.359, 3.358, 3.359],
      cr: [78, 77, 81, 78, 83, 82, 85, 84, 87, 84, 85, 81, 82, 79, 80, 77] },
    3: { soc: 94, u: 53.744, i: 4.56, p: 245.1, mos: 22.0, t: [20.0, 20.5, 19.8, 20.3], dv: 0.002, avg: 3.35938, min: 12, max: 3, cyc: 41, thr: 11485, rssi: -77, pon: 12,
      cv: [3.359, 3.359, 3.36, 3.36, 3.359, 3.359, 3.36, 3.359, 3.36, 3.36, 3.36, 3.358, 3.359, 3.359, 3.36, 3.359],
      cr: [77, 75, 79, 78, 83, 83, 85, 84, 87, 84, 85, 81, 82, 80, 80, 77] },
    4: { soc: 92, u: 53.744, i: 4.612, p: 247.9, mos: 23.6, t: [21.3, 21.6, 21.0, 21.4], dv: 0.002, avg: 3.359, min: 1, max: 2, cyc: 43, thr: 12061, rssi: -67, pon: 18,
      cv: [3.358, 3.36, 3.359, 3.359, 3.36, 3.359, 3.359, 3.358, 3.359, 3.359, 3.359, 3.36, 3.359, 3.36, 3.358, 3.358],
      cr: [74, 73, 76, 75, 79, 79, 83, 83, 85, 83, 85, 81, 80, 76, 77, 75] },
    5: { soc: 91, u: 53.739, i: 4.69, p: 252.0, mos: 21.7, t: [20.9, 21.4, 20.7, 21.2], dv: 0.005, avg: 3.35931, min: 16, max: 10, cyc: 45, thr: 12809, rssi: -61, pon: 10,
      cv: [3.359, 3.36, 3.36, 3.36, 3.36, 3.359, 3.359, 3.358, 3.359, 3.361, 3.359, 3.36, 3.36, 3.359, 3.36, 3.356],
      cr: [75, 73, 78, 75, 80, 79, 83, 81, 85, 81, 83, 78, 81, 77, 79, 75] },
    6: { soc: 90, u: 53.757, i: 4.706, p: 253.0, mos: 22.6, t: [20.2, 20.9, 20.2, 20.6], dv: 0.004, avg: 3.35981, min: 12, max: 14, cyc: 50, thr: 14177, rssi: -85, pon: 25,
      cv: [3.36, 3.36, 3.36, 3.36, 3.36, 3.36, 3.36, 3.36, 3.359, 3.36, 3.359, 3.358, 3.36, 3.362, 3.36, 3.359],
      cr: [60, 59, 63, 61, 65, 64, 68, 66, 68, 65, 67, 62, 64, 61, 63, 59] },
  };
  const bal = Number(q.get('bal') || 0);
  const err = Number(q.get('err') || 0);
  const em = Number(q.get('em') || 0);
  const off = Number(q.get('off') || 0);
  for (const [k, d] of Object.entries(P)) {
    const n = Number(k);
    const E = (dom, key) => `${dom}.pv_pack_${n}_${key}`;
    const ago = n === off ? 400 : 3 + n * 4;
    put(E('sensor', 'state_of_charge'), d.soc, '%');
    put(E('sensor', 'state_of_health'), 100, '%');
    put(E('sensor', 'capacity_remaining'), (280 * d.soc) / 100 - 0.4, 'Ah');
    put(E('sensor', 'full_charge_capacity'), 280, 'Ah');
    put(E('sensor', 'total_voltage'), d.u, 'V');
    put(E('sensor', 'current'), d.i, 'A');
    put(E('sensor', 'power'), d.p, 'W');
    put(E('sensor', 'mosfet_temperature'), d.mos, '°C');
    d.t.forEach((t, j) => put(E('sensor', `temperature_sensor_${j + 1}`), t, '°C'));
    put(E('sensor', 'delta_cell_voltage'), n === bal ? 0.011 : d.dv, 'V');
    put(E('sensor', 'average_cell_voltage'), d.avg, 'V');
    put(E('sensor', 'min_voltage_cell'), d.min);
    put(E('sensor', 'max_voltage_cell'), d.max);
    put(E('sensor', 'min_cell_voltage'), Math.min(...d.cv), 'V');
    put(E('sensor', 'max_cell_voltage'), Math.max(...d.cv), 'V');
    d.cv.forEach((v, j) => put(E('sensor', `cell_voltage_${j + 1}`), n === bal && j + 1 === d.max ? v + 0.008 : v, 'V'));
    d.cr.forEach((r, j) => put(E('sensor', `cell_resistance_${j + 1}`), r / 1000, 'Ω'));
    put(E('sensor', 'balancing_current'), n === bal ? -2.014 : 0, 'A');
    put(E('sensor', 'balancer_status_bitmask'), n === bal ? 1 : 0);
    put(E('binary_sensor', 'balancing'), n === bal ? 'on' : 'off');
    put(E('binary_sensor', 'charging'), 'on');
    put(E('binary_sensor', 'discharging'), 'on');
    put(E('switch', 'charging'), 'on');
    put(E('switch', 'discharging'), 'on');
    put(E('switch', 'balancer'), 'on');
    put(E('switch', 'emergency'), n === em ? 'on' : 'off');
    put(E('switch', 'charging_float_mode'), n === 1 ? 'off' : 'on');
    put(E('switch', 'enable_bluetooth_connection'), 'on');
    put(E('sensor', 'errors'), n === err ? 'Cell Undervoltage; Charge Overcurrent' : '');
    put(E('sensor', 'total_runtime'), 44580188, 's', {}, ago);
    put(E('sensor', 'total_runtime_formatted'), '1y 150d 23h');
    put(E('sensor', 'charge_status'), 'Bulk');
    put(E('sensor', 'charging_cycles'), d.cyc);
    put(E('sensor', 'total_charging_cycle_capacity'), d.thr, 'Ah');
    put(E('sensor', 'emergency_time_countdown'), n === em ? 1712 : 0, 's');
    put(E('sensor', 'ble_reconnect_duration'), n === 6 ? 168.7 : 0, 's');
    put(E('sensor', 'ble_watchdog_fixes'), 0);
    put(E('sensor', 'ble_last_fix_state'), 0);
    put(E('sensor', 'ble_keepalive'), 5);
    put(E('sensor', 'power_on_count'), d.pon);
    put(E('button', 'restart'), 'unknown');
    const s = Math.ceil(n / 3);
    put(`sensor.pv_battery_stack_${s}_pack_${n}_rssi`, d.rssi, 'dBm');
  }
  for (const [s, t, w, up] of [[1, 43.9, -57, 78664], [2, 41.0, -53, 78122]]) {
    put(`sensor.battery_stack_${s}_internal_temperature`, t, '°C');
    put(`sensor.battery_stack_${s}_wifi_signal_strength`, w, 'dBm');
    put(`sensor.battery_stack_${s}_uptime_sensor`, up, 's');
    put(`sensor.pv_battery_stack_${s}_watchdog_reboots`, 0);
    put(`button.pv_battery_stack_${s}_restart`, 'unknown');
  }
  put('input_select.zellen_pack', `Pack_${q.get('pack') || 1}`, '', { options: [1, 2, 3, 4, 5, 6].map((i) => `Pack_${i}`) });
  put('input_select.zellen_zeitraum', '30 Tage', '', { options: ['7 Tage', '30 Tage', '90 Tage', '365 Tage', 'seit Beginn'] });
  put('input_select.zellen_zustand', 'Entladen', '', { options: ['Laden', 'Entladen', 'Ruhe'] });
  put('input_number.zellen_mindestspreizung', 0.5, 'mV', { min: 0, max: 2, step: 0.1 });

  const entities = {};
  for (const s of [1, 2]) for (const k of ['sensor.battery_stack_' + s + '_uptime_sensor', 'button.pv_battery_stack_' + s + '_restart']) entities[k] = { entity_id: k, device_id: 'dev-stack-' + s };
  window.mockHass = {
    states,
    entities,
    user: { is_admin: q.get('admin') !== '0' },
    themes: { darkMode: q.get('dark') === '1' },
    callService: async (d, s, data) => {
      console.log('callService', d, s, JSON.stringify(data));
    },
    callWS: async () => ({}),
  };
})();
