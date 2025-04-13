import { fY as arrayMap, fZ as getAllKeysIn, f_ as baseIteratee, f$ as basePickBy } from "./index-BolKFsR6.js";
function pickBy(object, predicate) {
  if (object == null) {
    return {};
  }
  var props = arrayMap(getAllKeysIn(object), function(prop) {
    return [prop];
  });
  predicate = baseIteratee(predicate);
  return basePickBy(object, props, function(value, path) {
    return predicate(value, path[0]);
  });
}
export {
  pickBy as p
};
