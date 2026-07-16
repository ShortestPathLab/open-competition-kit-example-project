/**
 * What the suite runs, and what it scores against.
 *
 * ## These are not the real marking benchmarks
 *
 * The real course scores against `eval_q1a_4.lay`, `eval_q1b_2.lay` and 53 more
 * that are deliberately withheld from students — they exist in no public branch
 * of ShortestPathLab/pacman, and never have. Only the practice layouts ship.
 *
 * So the benchmarks below were *measured*, by running a reference solution
 * against each practice layout in the evaluation image. That makes them honest
 * and reproducible, and makes the reference score ~1.0 per instance, but it does
 * not make them the marking scheme. Swap in the real layouts and numbers and
 * nothing else here changes.
 *
 * ## How a score is reached
 *
 * Each instance is worth at most 1, so a question's maximum is its instance
 * count. That is why `max` here is 10/11/11/11 rather than the course's 4/6/10/35
 * — different layouts, different count.
 */

/** Which questions to run. The full suite takes minutes; Q1a takes seconds. */
export const questions = (
  process.env.FIT5047_QUESTIONS ?? "q1a"
)
  .split(",")
  .map((q) => q.trim().toLowerCase())
  .filter(Boolean);

/** The evaluation image. Built from fit5047/pacman.dockerfile; must exist on the host. */
export const image = process.env.FIT5047_IMAGE ?? "ock-pacman-a1:dev";

export default {
  max: { score1: 10, score2: 11, score3: 11, score4: 11 },

  /** Q1a: shortest path. Benchmark is the optimal cost; scored benchmark/cost. */
  q1InstancesAndScores: [
    ["layouts/q1a_bigMaze.lay", 210.0],
    ["layouts/q1a_bigMaze2.lay", 58.0],
    ["layouts/q1a_contoursMaze.lay", 13.0],
    ["layouts/q1a_mediumMaze.lay", 68.0],
    ["layouts/q1a_mediumMaze2.lay", 50.0],
    ["layouts/q1a_openMaze.lay", 54.0],
    ["layouts/q1a_smallMaze.lay", 19.0],
    ["layouts/q1a_testMaze.lay", 27.0],
    ["layouts/q1a_tinyMaze.lay", 8.0],
    ["layouts/q1a_trickyMaze.lay", 41.0],
  ],

  /**
   * Q1b: corners. Scored on *expansions*, not cost — the point is the heuristic,
   * and a better one explores less. Benchmark is the reference's expansions.
   */
  q1bInstancesAndScores: [
    ["layouts/q1b_bigCorners.lay", 35.0],
    ["layouts/q1b_bigCorners2.lay", 104.0],
    ["layouts/q1b_closed.lay", 58.0],
    ["layouts/q1b_mediumCorners.lay", 19.0],
    ["layouts/q1b_mediumCorners2.lay", 35.0],
    ["layouts/q1b_openCorners.lay", 24.0],
    ["layouts/q1b_openCorners2.lay", 14.0],
    ["layouts/q1b_smallCorners.lay", 15.0],
    ["layouts/q1b_tinyCorners.lay", 4.0],
    ["layouts/q1b_tinyCorners2.lay", 2.0],
    ["layouts/q1b_trickyCorners.lay", 11.0],
  ],

  /**
   * The optimal path length per Q1b layout, in the same order.
   *
   * A search cannot expand fewer nodes than the path it returns is long, so
   * expansions below this is not a better heuristic — it is a broken one, or a
   * hardcoded answer. Such a run scores 0.
   */
  q1bOptimalPathLengths: [30.0, 43.0, 38.0, 18.0, 32.0, 23.0, 13.0, 14.0, 3.0, 1.0, 10.0],

  /** Q1c: eat all the food. Scored on the game's own score; benchmark is the reference's. */
  q1cInstancesAndScores: [
    ["layouts/q1c_bigSearch.lay", 2360.0],
    ["layouts/q1c_boxSearch.lay", 738.0],
    ["layouts/q1c_closed.lay", 122.0],
    ["layouts/q1c_greedySearch.lay", 610.0],
    ["layouts/q1c_mediumDottedMaze.lay", 646.0],
    ["layouts/q1c_mediumSearch.lay", 1409.0],
    ["layouts/q1c_oddSearch.lay", 907.0],
    ["layouts/q1c_openSearch.lay", 1292.0],
    ["layouts/q1c_smallSearch.lay", 622.0],
    ["layouts/q1c_tinySearch.lay", 569.0],
    ["layouts/q1c_trickySearch.lay", 562.0],
  ],

  /**
   * Q2: play against ghosts. Scored on the game's score.
   *
   * `q2_dangerClassic.lay` is left out on purpose: the reference scores -169 on
   * it, and the suite floors any non-positive score to 0, so the layout could
   * only ever award nothing. The course's own config comments layouts out for
   * what looks like the same reason.
   */
  q2InstancesAndScores: [
    ["layouts/q2_capsuleClassic.lay", 1326.0],
    ["layouts/q2_contestClassic.lay", 2237.0],
    ["layouts/q2_mediumClassic.lay", 2477.0],
    ["layouts/q2_mediumClassic2.lay", 687.0],
    ["layouts/q2_minimaxClassic.lay", 516.0],
    ["layouts/q2_openClassic.lay", 1417.0],
    ["layouts/q2_originalClassic.lay", 3738.0],
    ["layouts/q2_smallClassic.lay", 656.0],
    ["layouts/q2_testClassic.lay", 564.0],
    ["layouts/q2_trappedClassic.lay", 532.0],
    ["layouts/q2_trickyClassic.lay", 3590.0],
  ],
} as const;
