// Shared WCA-average (AoX) computation.
//
// WCA rule: the best and worst ceil(5%) results are trimmed, and a DNF ALWAYS
// counts as the worst result — it is forced to the bottom of the ranking and can
// never land in the trimmed mean. If more DNFs remain than can be trimmed
// (e.g. 2+ DNF in an Ao5), the whole average is a DNF.

const dropCount = (x) => Math.ceil(0.05 * x)

// Rank key: DNFs sort to the end regardless of their underlying time.
const rankKey = (s) => (s.penalty === 'dnf' ? Infinity : s.time)

const mean = (nums) => nums.reduce((a, b) => a + b, 0) / nums.length

/**
 * Stats for a single window of solve objects ({ time, penalty, ... }).
 * Returns { time, isDnf, window, trimmedIndices } where trimmedIndices are
 * positions within `window` that were dropped (best + worst).
 */
export function aoWindowStats(window, x = window.length) {
  const drop = dropCount(x)
  const order = window
    .map((s, idx) => ({ s, idx }))
    .sort((a, b) => rankKey(a.s) - rankKey(b.s))

  const trimmedIndices = [
    ...order.slice(0, drop),
    ...order.slice(order.length - drop),
  ].map((o) => o.idx)

  const kept = order.slice(drop, order.length - drop)
  const dnfCount = window.reduce((n, s) => n + (s.penalty === 'dnf' ? 1 : 0), 0)
  const isDnf = dnfCount > drop || kept.some((o) => o.s.penalty === 'dnf')

  const fallback = parseFloat(mean(window.map((s) => s.time)).toFixed(3))
  const time = isDnf ? fallback : parseFloat(mean(kept.map((o) => o.s.time)).toFixed(3))

  return { time, isDnf, window, trimmedIndices }
}

/**
 * Rolling AoX over a sequence of solve objects.
 * Element i is null for i < x-1 (warm-up), otherwise an aoWindowStats object.
 */
export function computeAoX(solves, x) {
  const result = []
  for (let i = 0; i < solves.length; i++) {
    if (i < x - 1) {
      result.push(null)
      continue
    }
    result.push(aoWindowStats(solves.slice(i - x + 1, i + 1), x))
  }
  return result
}

/**
 * Rolling AoX as plain numbers: null for warm-up windows AND for DNF averages.
 */
export function computeAoXTimes(solves, x) {
  return computeAoX(solves, x).map((e) => (e && !e.isDnf ? e.time : null))
}
