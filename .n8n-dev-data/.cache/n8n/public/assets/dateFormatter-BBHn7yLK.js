import { fb as dateformat } from "./index-BolKFsR6.js";
const convertToDisplayDateComponents = (fullDate) => {
  const mask = `d mmm${new Date(fullDate).getFullYear() === (/* @__PURE__ */ new Date()).getFullYear() ? "" : ", yyyy"}#HH:MM:ss`;
  const formattedDate = dateformat(fullDate, mask);
  const [date, time] = formattedDate.split("#");
  return { date, time };
};
function convertToDisplayDate(fullDate) {
  const mask = `mmm d${new Date(fullDate).getFullYear() === (/* @__PURE__ */ new Date()).getFullYear() ? "" : ", yyyy"}#HH:MM:ss`;
  const formattedDate = dateformat(fullDate, mask);
  const [date, time] = formattedDate.split("#");
  return { date, time };
}
const toDayMonth = (fullDate) => dateformat(fullDate, "d mmm");
const toTime = (fullDate, includeMillis = false) => dateformat(fullDate, includeMillis ? "HH:MM:ss.l" : "HH:MM:ss");
export {
  toDayMonth as a,
  convertToDisplayDateComponents as b,
  convertToDisplayDate as c,
  toTime as t
};
