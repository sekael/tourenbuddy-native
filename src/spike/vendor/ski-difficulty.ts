/**
 * SAC ski-touring scale, easiest first. Swisstopo localizes it: German letters in
 * `_de`, the French (alpine) letters in `_en`/`_fr`/`_it`. The two sets don't
 * collide, so both resolve to the same step.
 */
const SKI_SCALE = [['L', 'F'], ['WS', 'PD'], ['ZS', 'AD'], ['S', 'D'], ['SS', 'TD'], ['AS', 'ED'], ['EX', 'EX']] as const

/**
 * SAC difficulty ("ZS+", "S-", "PD") as one ordinal, modifiers included:
 * L- = 0, L = 1, L+ = 2, WS- = 3 … EX+ = 20. null for missing or unknown values.
 */
export function skiDifficultyGrade(difficulty: string | null): number | null {
  const match = difficulty?.trim().toUpperCase().match(/^([A-Z]+)([+-]?)$/)
  const base = match ? SKI_SCALE.findIndex(letters => (letters as readonly string[]).includes(match[1]!)) : -1
  if (!match || base < 0)
    return null
  return base * 3 + (match[2] === '-' ? 0 : match[2] === '+' ? 2 : 1)
}
