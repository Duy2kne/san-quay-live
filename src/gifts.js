import fs from 'fs';
import path from 'path';

let defaultGiftsConfig = {
  tiers: [
    { min: 1, max: 4, effect: 'cheers', extra: 'hearts' },
    { min: 5, max: 29, effect: 'bounce', extra: 'confetti' },
    { min: 30, max: 99, effect: 'moonwalk', extra: 'floor_glow' },
    { min: 100, max: 499, effect: 'stage_solo', extra: 'spotlight' },
    { min: 500, max: 999, effect: 'money_rain', extra: 'drone_cam' },
    { min: 1000, max: 9999, effect: 'vip_show', extra: 'fireworks' },
    { min: 10000, max: 9999999, effect: 'dragon_ride', extra: 'golden_banner' }
  ],
  nameOverrides: {},
  danceMoves: [
    'wave', 'cheers', 'bounce', 'clap', 'hip_shake', 'spin',
    'robot', 'moonwalk', 'hands_up', 'breakdance', 'shuffle',
    'floss', 'heart_dance', 'stage_solo'
  ],
  effectsList: [
    'hearts', 'confetti', 'fireworks', 'rose_rain', 'money_rain',
    'rocket', 'drone_cam', 'spotlight', 'laser_show', 'light_dragon',
    'light_lion', 'star_shower', 'glitter_bomb', 'fire_ring', 'vip_show'
  ]
};

try {
  const cfgPath = path.resolve(process.cwd(), 'config', 'gifts.json');
  if (fs.existsSync(cfgPath)) {
    const raw = fs.readFileSync(cfgPath, 'utf8');
    defaultGiftsConfig = { ...defaultGiftsConfig, ...JSON.parse(raw) };
  }
} catch (err) {
  console.warn('[gifts] Using default gifts config due to load error:', err.message);
}

export function getGiftsConfig() {
  return defaultGiftsConfig;
}

export function updateGiftsConfig(newConfig) {
  defaultGiftsConfig = { ...defaultGiftsConfig, ...newConfig };
  const cfgPath = path.resolve(process.cwd(), 'config', 'gifts.json');
  try {
    fs.writeFileSync(cfgPath, JSON.stringify(defaultGiftsConfig, null, 2), 'utf8');
  } catch (err) {
    console.error('[gifts] Failed to save updated config/gifts.json:', err.message);
  }
}

export function resolveGiftEffect(giftName, diamonds, count = 1, customOverrides = {}) {
  const total = (diamonds || 1) * (count || 1);
  const overrides = { ...defaultGiftsConfig.nameOverrides, ...customOverrides };

  let chosenEffect = null;
  let chosenExtra = null;
  let chosenDance = 'bounce';

  if (giftName && overrides[giftName]) {
    chosenEffect = overrides[giftName];
  }

  if (!chosenEffect) {
    for (const tier of defaultGiftsConfig.tiers) {
      if (total >= tier.min && total <= tier.max) {
        chosenEffect = tier.effect;
        chosenExtra = tier.extra;
        break;
      }
    }
  }

  if (!chosenEffect) {
    chosenEffect = total >= 10000 ? 'dragon_ride' : total >= 1000 ? 'vip_show' : 'cheers';
  }

  switch (chosenEffect) {
    case 'cheers':
      chosenDance = 'cheers';
      chosenExtra = chosenExtra || 'hearts';
      break;
    case 'bounce':
      chosenDance = 'bounce';
      chosenExtra = chosenExtra || 'confetti';
      break;
    case 'moonwalk':
      chosenDance = 'moonwalk';
      chosenExtra = chosenExtra || 'floor_glow';
      break;
    case 'stage_solo':
      chosenDance = 'stage_solo';
      chosenExtra = chosenExtra || 'spotlight';
      break;
    case 'money_rain':
      chosenDance = 'hands_up';
      chosenExtra = chosenExtra || 'drone_cam';
      break;
    case 'vip_show':
      chosenDance = 'breakdance';
      chosenExtra = chosenExtra || 'fireworks';
      break;
    case 'dragon_ride':
    case 'lion_show':
    case 'super_show':
      chosenDance = 'shuffle';
      chosenExtra = chosenExtra || 'golden_banner';
      break;
    default:
      chosenDance = 'bounce';
      chosenExtra = 'hearts';
  }

  const isStageShow = total >= 100 || chosenEffect === 'stage_solo' || chosenEffect === 'vip_show' || chosenEffect === 'dragon_ride';
  const isVipShow = total >= 1000 || chosenEffect === 'vip_show';
  const isSuperShow = total >= 10000 || chosenEffect === 'dragon_ride' || chosenEffect === 'lion_show' || chosenEffect === 'super_show';

  let duration = 5000;
  if (isSuperShow) duration = 12000;
  else if (isVipShow) duration = 15000;
  else if (isStageShow) duration = 8000;

  return {
    effect: chosenEffect,
    extra: chosenExtra,
    dance: chosenDance,
    totalDiamonds: total,
    count,
    diamonds,
    duration,
    isStageShow,
    isVipShow,
    isSuperShow,
  };
}
