// Teams nominated to the finals, shown on /finalists. Names are as the
// organisers announced them; the page lists them by group number.
export const FINALISTS_TITLE = "الفرق المتأهلة للنهائيات";

export const FINALISTS: { group: number; name: string }[] = [
  { group: 1, name: "حكايات النجوم" },
  { group: 2, name: "احتواء" },
  { group: 7, name: "وميض" },
  { group: 8, name: "مِراس" },
  { group: 11, name: "نَسْج" },
  { group: 13, name: "بَوْح" },
  { group: 14, name: "بذور الفضاء" },
  { group: 17, name: "رسمتي" },
  { group: 18, name: "حَرَكة" },
];

/** 14 → «١٤», matching how the organisers write group numbers. */
export const arabicDigits = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
