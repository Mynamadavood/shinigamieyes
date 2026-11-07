export type FollowEvent = "userGesture" | "recenter" | "viewChanged";
export interface FollowResult {
  action: "none" | "easeTo" | "flyTo";
  showRecenter: boolean;
}

/** Pure follow/recenter state machine (D-06, D-07). Follow starts on. */
export function createFollow(): { following(): boolean; on(e: FollowEvent): FollowResult } {
  let follow = true;
  return {
    following: () => follow,
    on(e) {
      if (e === "userGesture") {
        follow = false;
        return { action: "none", showRecenter: true };
      }
      if (e === "recenter") {
        follow = true;
        return { action: "flyTo", showRecenter: false };
      }
      return follow
        ? { action: "easeTo", showRecenter: false }
        : { action: "none", showRecenter: true };
    },
  };
}
