// Estimates the iRating change a driver would receive if the race ended with drivers in their current position order.
// Ported from here: https://github.com/SIMRacingApps/SIMRacingApps/issues/209#issuecomment-531877336.
// Deviations of +/-1 iRating point (occasionally more) from the real result are expected.

const K = 1600 / Math.log(2) // ~2308.42, iRacing's own logistic scaling constant (also used for Strength of Field)

// Probability that driver i beats driver j, given their iRatings.
function pairwiseWinProbability(rI: number, rJ: number): number {
  if (rI === rJ) return 0.5

  const eI = Math.exp(-rI / K)
  const eJ = Math.exp(-rJ / K)
  const aI = 1 - eI
  const aJ = 1 - eJ

  return (aI * eJ) / (aJ * eI + aI * eJ)
}

// oldIRatings must already be ordered by current position (index 0 = leader).
// Returns the estimated iRating change per entry, same order/length as the input.
// null for an entry with no valid iRating (r <= 0) - still counted as an
// opponent for everyone else's expected score, just no change computed for itself.
// Unlike the source script, there's no DNS handling here - live position order
// doesn't tell us who will actually start/finish, every entry is treated as a starter.
export function estimateIratingChanges(oldIRatings: number[]): (number | null)[] {
  const n = oldIRatings.length
  if (n < 2) return oldIRatings.map(() => null)

  const expectedScores = oldIRatings.map((r, i) =>
    oldIRatings.reduce((sum, other, j) => (i === j ? sum : sum + pairwiseWinProbability(r, other)), 0)
  )

  return oldIRatings.map((r, i) => {
    if (r <= 0) return null

    const position = i + 1
    const fudge = (n / 2 - position) / 100
    return ((n - position - expectedScores[i] - fudge) * 200) / n
  })
}
