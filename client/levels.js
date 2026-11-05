export const LEVEL_TIERS = [
  { min: 0, max: 0, name: 'Khách Thường', badgeColor: '#9e9e9e', textColor: '#ffffff' },
  { min: 1, max: 9, name: 'Tập Sự', badgeColor: '#22c55e', textColor: '#86efac' },
  { min: 10, max: 19, name: 'Dân Chơi', badgeColor: '#3b82f6', textColor: '#93c5fd' },
  { min: 20, max: 29, name: 'VIP Đồng', badgeColor: '#06b6d4', textColor: '#67e8f9' },
  { min: 30, max: 49, name: 'VIP Bạc', badgeColor: '#a855f7', textColor: '#d8b4fe' },
  { min: 50, max: 69, name: 'VIP Vàng', badgeColor: '#f59e0b', textColor: '#fde68a' },
  { min: 70, max: 89, name: 'Kim Cương', badgeColor: '#f97316', textColor: '#fdba74' },
  { min: 90, max: 99, name: 'Bá Chủ', badgeColor: '#ef4444', textColor: '#fca5a5' },
  { min: 100, max: 100, name: 'Huyền Thoại', badgeColor: '#ec4899', textColor: '#fbcfe8', isRainbow: true },
];

export function getLevelTier(level = 0) {
  const lvl = Math.min(100, Math.max(0, parseInt(level, 10) || 0));
  for (const tier of LEVEL_TIERS) {
    if (lvl >= tier.min && lvl <= tier.max) {
      return { ...tier, level: lvl };
    }
  }
  return { ...LEVEL_TIERS[0], level: 0 };
}

export function getUnlockedPerks(level = 0) {
  const lvl = Math.min(100, Math.max(0, parseInt(level, 10) || 0));
  return {
    level: lvl,
    hasGreenBadge: lvl >= 1,
    hasGlowBorder: lvl >= 1,
    hasFloorRing: lvl >= 10,
    hasMiniWings: lvl >= 20,
    hasParachuteDrop: lvl >= 20 && lvl < 100,
    hasFootstepSparkles: lvl >= 30,
    hasGlitterOutfit: lvl >= 30,
    hasMiniCrown: lvl >= 50,
    hasBodyAura: lvl >= 50,
    hasPersonalLightBeam: lvl >= 50,
    hasFloatingPet: lvl >= 70,
    hasMajesticWings: lvl >= 90,
    hasGoldenAura: lvl >= 90,
    hasSpecialFanfare: lvl >= 90,
    isLegendary: lvl >= 100,
    hasDragonMount: lvl >= 100,
    hasRainbowAura: lvl >= 100,
  };
}
