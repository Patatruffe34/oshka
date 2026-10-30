/** Add an id to a list, or take it out if already there */
export const toggleIn = (list, id) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
