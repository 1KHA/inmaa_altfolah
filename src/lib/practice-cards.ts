/*
 * The 12 practice cards (نماذج عمل هاكاثون الطفولة) from
 * practice/نماذج المختبرات.pdf, as data: every card's title, subtitle, fields
 * and the layout that reproduces the sheet. Shared by the participant page
 * (fill in), the advisor/admin review pages (read) and the API (validation).
 *
 * Field keys are stored in PracticeSubmission.answers, so renaming one loses
 * what teams already wrote in it; add new keys instead.
 */

export type PracticeTone = "purple" | "teal" | "honey" | "coral" | "gray";

/** The sheet's colours: accent (bars, headers) and tint (panel backgrounds). */
export const PRACTICE_TONES: Record<PracticeTone, { accent: string; tint: string }> = {
  purple: { accent: "#6E155E", tint: "#F5EAF2" },
  teal: { accent: "#00AFA0", tint: "#E8F7F5" },
  honey: { accent: "#F6A619", tint: "#FFF3D7" },
  coral: { accent: "#F05A3B", tint: "#FDECE8" },
  gray: { accent: "#6B7280", tint: "#F7F5F7" },
};

export interface PracticeField {
  key: string;
  label: string;
  hint?: string;
  /** Colour of the box's side bar */
  tone?: PracticeTone;
  /** textarea (default), one-line text, date, or one of `options` */
  kind?: "textarea" | "text" | "date" | "choice";
  options?: string[];
  rows?: number;
  /** Columns taken in a `row` section (md and up) */
  span?: number;
}

export type PracticeSection =
  /** Boxes side by side */
  | { type: "row"; cols: number; fields: PracticeField[] }
  /** Bold line introducing the next section */
  | { type: "heading"; text: string }
  /** Tinted strip, e.g. «كيف يمكننا أن…» */
  | { type: "banner"; tone: PracticeTone; title?: string; cols?: number; fields: PracticeField[] }
  /** Stakeholder matrix: influence (rows) × how affected (columns) */
  | {
      type: "matrix";
      rowAxis: [string, string];
      colAxis: [string, string];
      note?: string;
      /** Reading order: top-start, top-end, bottom-start, bottom-end */
      cells: (PracticeField & { tone: PracticeTone })[];
    }
  /** Effects on top, the central box, causes (each with its root) below */
  | {
      type: "tree";
      top: PracticeField[];
      topTone: PracticeTone;
      center: PracticeField;
      centerTone: PracticeTone;
      bottomTone: PracticeTone;
      bottom: PracticeField[][];
    }
  /** Columns with a coloured header; `arrows` links them as a sequence */
  | {
      type: "columns";
      arrows?: boolean;
      columns: { title: string; hint?: string; tone: PracticeTone; fields: PracticeField[] }[];
    }
  /** Numbered steps (1 → 2 → 3) */
  | { type: "steps"; title?: string; steps: (PracticeField & { tone: PracticeTone })[] }
  /** Side-by-side panels, each holding its own sections */
  | {
      type: "panels";
      /** Tailwind grid template for lg and up */
      template: string;
      panels: {
        title: string;
        tone: PracticeTone;
        /** "outline": tinted panel with a title chip; "circle": the round beneficiary profile */
        variant?: "outline" | "circle" | "plain";
        note?: string;
        sections: PracticeSection[];
      }[];
    };

export interface PracticeCard {
  key: string;
  number: number;
  title: string;
  subtitle: string;
  sections: PracticeSection[];
}

const ideaFields = (prefix: string, label: string, hint: string, tones: PracticeTone[]): PracticeField[] =>
  tones.map((tone, i) => ({ key: `${prefix}${i + 1}`, label: `${label} ${i + 1}`, hint, tone, rows: 2 }));

export const PRACTICE_CARDS: PracticeCard[] = [
  {
    key: "challenge-framing",
    number: 1,
    title: "بطاقة تأطير التحدي",
    subtitle: "تُستخدم لتحديد المشكلة وتحويلها إلى سؤال تصميم واضح وقابل للتطوير",
    sections: [
      {
        type: "row",
        cols: 5,
        fields: [
          { key: "initialProblem", label: "المشكلة الأولية", hint: "ما المشكلة التي لاحظها الفريق؟ وما الشاهد عليها؟", tone: "purple", span: 2 },
          { key: "affectedGroup", label: "الفئة المتأثرة", hint: "من يعيش المشكلة مباشرة؟", tone: "teal" },
          { key: "desiredImpact", label: "الأثر المطلوب", hint: "ما التغير الذي نريد الوصول إليه؟", tone: "honey" },
          { key: "contextConstraints", label: "السياق والقيود", hint: "ما الذي يحدد نطاق الحل؟", tone: "coral" },
        ],
      },
      { type: "banner", tone: "purple", fields: [{ key: "howMightWe", label: "كيف يمكننا أن", rows: 2 }] },
      { type: "heading", text: "مساحة اختبار اتساع السؤال: اكتب خمس أفكار مختلفة بسرعة" },
      { type: "row", cols: 5, fields: ideaFields("idea", "فكرة", "عنوان مختصر للفكرة", ["teal", "purple", "coral", "honey", "teal"]) },
      {
        type: "row",
        cols: 1,
        fields: [
          {
            key: "refinedChallenge",
            label: "الصياغة المنقحة للتحدي",
            hint: "عدّل سؤال التحدي بعد مراجعة الفئة والأثر والقيود وقدرته على توليد حلول متنوعة",
            tone: "purple",
          },
        ],
      },
    ],
  },
  {
    key: "stakeholder-matrix",
    number: 2,
    title: "مصفوفة أصحاب العلاقة",
    subtitle: "يوضع كل طرف بحسب مقدار تأثيره في الحل ومدى تأثره بالمشكلة",
    sections: [
      {
        type: "matrix",
        rowAxis: ["تأثير مرتفع", "تأثير منخفض"],
        colAxis: ["تأثر مرتفع", "تأثر منخفض"],
        note: "دوّن اسم الطرف داخل المساحة المناسبة",
        cells: [
          { key: "manageClosely", label: "إدارة وثيقة", hint: "إشراك مستمر في البحث والتصميم والقرار", tone: "purple", rows: 6 },
          { key: "keepSatisfied", label: "إبقاء على الرضا", hint: "استشارة عند القرارات المؤثرة", tone: "teal", rows: 6 },
          { key: "involveUnderstand", label: "إشراك وفهم الاحتياج", hint: "مصدر أساسي للرؤى واختبار الحل", tone: "honey", rows: 6 },
          { key: "monitor", label: "متابعة", hint: "يراجع موقعه عند ظهور معلومات جديدة", tone: "gray", rows: 6 },
        ],
      },
    ],
  },
  {
    key: "interview-insight",
    number: 3,
    title: "بطاقة المقابلة واستخلاص الرؤية",
    subtitle: "تفصل البطاقة بين ما قاله المشارك وما لاحظه الفريق والتفسير الذي سيؤثر في التصميم",
    sections: [
      {
        type: "panels",
        template: "lg:grid-cols-2",
        panels: [
          {
            title: "أولًا: بطاقة المقابلة",
            tone: "teal",
            note: "افصل الشاهد عن تفسيرك",
            sections: [
              { type: "row", cols: 1, fields: [{ key: "participantContext", label: "المشارك والسياق", hint: "من تمت مقابلته؟ أين؟ متى؟", tone: "teal", rows: 2 }] },
              { type: "row", cols: 1, fields: [{ key: "learningQuestion", label: "ما الذي نريد تعلمه؟", hint: "اكتب سؤال التعلم قبل المقابلة", tone: "teal", rows: 2 }] },
              {
                type: "row",
                cols: 2,
                fields: [
                  { key: "behaviorNotes", label: "ملاحظات سلوكية", hint: "ماذا فعل أو أظهر؟", tone: "teal", rows: 7 },
                  { key: "directQuotes", label: "اقتباسات مباشرة", hint: "سجل عباراته كما قالها", tone: "teal", rows: 7 },
                ],
              },
            ],
          },
          {
            title: "ثانيًا: بطاقة استخلاص الرؤية",
            tone: "purple",
            sections: [
              { type: "row", cols: 1, fields: [{ key: "evidence", label: "الشاهد", hint: "ما القول أو السلوك الذي نستند إليه؟", tone: "purple", rows: 2 }] },
              { type: "row", cols: 1, fields: [{ key: "meaningPattern", label: "المعنى أو النمط", hint: "ماذا يتكرر أو ماذا يكشف؟", tone: "purple", rows: 2 }] },
              { type: "row", cols: 1, fields: [{ key: "extractedNeed", label: "الحاجة المستخلصة", hint: "ما الذي يحتاجه المستفيد فعلًا؟", tone: "purple", rows: 2 }] },
              { type: "row", cols: 1, fields: [{ key: "designInsight", label: "الرؤية التي ستؤثر في التصميم", hint: "صياغة قصيرة تربط الشاهد بحاجة قابلة للتصميم", tone: "purple", rows: 3 }] },
              { type: "row", cols: 1, fields: [{ key: "followUpQuestion", label: "سؤال متابعة", tone: "coral", rows: 1 }] },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "problem-tree",
    number: 4,
    title: "شجرة المشكلة وصياغة سؤال التحدي",
    subtitle: "تربط الأسباب بالمشكلة المركزية ثم بالآثار، وتحدد الجزء الذي يستطيع الفريق التأثير فيه",
    sections: [
      {
        type: "tree",
        top: ideaFields("effect", "أثر", "ما الذي ينتج عن المشكلة؟", ["coral", "coral", "coral"]),
        topTone: "coral",
        center: { key: "centralProblem", label: "المشكلة المركزية", hint: "صياغة محددة مدعومة بشاهد", rows: 2 },
        centerTone: "purple",
        bottomTone: "teal",
        bottom: [1, 2, 3].map((i) => [
          { key: `directCause${i}`, label: `سبب مباشر ${i}`, hint: "لماذا تحدث المشكلة؟", tone: "teal" as PracticeTone, rows: 2 },
          { key: `rootCause${i}`, label: `سبب جذري ${i}`, hint: "ما الذي يقف خلف السبب؟", tone: "honey" as PracticeTone, rows: 2 },
        ]),
      },
      { type: "banner", tone: "honey", fields: [{ key: "challengeQuestion", label: "سؤال التحدي: كيف يمكننا أن…؟", rows: 2 }] },
    ],
  },
  {
    key: "solution-tree",
    number: 5,
    title: "شجرة الحل وتوليد البدائل",
    subtitle: "تحوّل الأسباب إلى وسائل قابلة للتنفيذ والآثار إلى نتائج مرغوبة",
    sections: [
      {
        type: "tree",
        top: ideaFields("desiredResult", "نتيجة مرغوبة", "ما الذي سيتغير عند نجاح الحل؟", ["teal", "teal", "teal"]),
        topTone: "teal",
        center: { key: "desiredState", label: "الحالة المرغوبة أو الحل", hint: "صف النتيجة الإيجابية في جملة واحدة", rows: 2 },
        centerTone: "honey",
        bottomTone: "purple",
        bottom: [1, 2, 3].map((i) => [
          { key: `means${i}`, label: `وسيلة ${i}`, hint: "ما الذي يمكن للفريق تنفيذه؟", tone: "purple" as PracticeTone, rows: 2 },
          { key: `alternative${i}`, label: `بديل ${i}`, hint: "صياغة فكرة حل مختلفة", tone: "coral" as PracticeTone, rows: 2 },
        ]),
      },
      {
        type: "banner",
        tone: "purple",
        title: "البدائل المرشحة للانتقال إلى المفاضلة",
        cols: 3,
        fields: [1, 2, 3].map((i) => ({ key: `shortlist${i}`, label: `${i}`, kind: "text" as const })),
      },
    ],
  },
  {
    key: "idea-selection",
    number: 6,
    title: "بطاقة اختيار الأفكار",
    subtitle: "تختار الفرق أفكارًا من أربع زوايا قبل الانتقال إلى بناء مفهوم الحل",
    sections: [
      {
        type: "columns",
        columns: (
          [
            ["rational", "الاختيار العقلاني", "الأوضح من حيث الجدوى والموارد", "teal"],
            ["delight", "الأكثر إسعادًا للمستفيد", "الأقرب إلى حاجة المستفيد وتجربته", "honey"],
            ["darling", "الفكرة المحببة للفريق", "الفكرة التي يملك الفريق دافعًا لتطويرها", "purple"],
            ["bold", "الاختيار الجريء", "الفكرة عالية الطموح التي تستحق الاستكشاف", "coral"],
          ] as const
        ).map(([key, title, hint, tone]) => ({
          title,
          hint,
          tone,
          fields: [
            { key: `${key}Idea`, label: "الفكرة المختارة", rows: 3 },
            { key: `${key}Reason`, label: "سبب الاختيار", rows: 2 },
            { key: `${key}Assumption`, label: "الافتراض الأخطر", rows: 2 },
          ],
        })),
      },
      {
        type: "banner",
        tone: "gray",
        title: "قرار الفريق",
        cols: 2,
        fields: [
          { key: "conceptIdea", label: "الفكرة التي ستنتقل لبناء المفهوم", rows: 2 },
          { key: "decisionReason", label: "سبب القرار", rows: 2 },
        ],
      },
    ],
  },
  {
    key: "solution-concept",
    number: 7,
    title: "بطاقة وصف مفهوم الحل",
    subtitle: "تحوّل الفكرة المختارة إلى مفهوم يمكن شرحه وبناء نموذج أولي له",
    sections: [
      {
        type: "row",
        cols: 3,
        fields: [
          { key: "conceptName", label: "اسم مفهوم الحل", hint: "اسم قصير وواضح", tone: "purple", kind: "text" },
          { key: "beneficiary", label: "المستفيد المحدد", hint: "من سيستخدم الحل أو يستفيد منه؟", tone: "teal", rows: 2 },
          { key: "needAddressed", label: "الحاجة التي يعالجها", hint: "ما الحاجة ذات الأولوية؟", tone: "honey", rows: 2 },
        ],
      },
      {
        type: "row",
        cols: 1,
        fields: [
          {
            key: "oneSentence",
            label: "وصف المفهوم في جملة واحدة",
            hint: "يقدّم الحل …… للفئة …… حتى تتمكن من ……",
            tone: "purple",
            rows: 2,
          },
        ],
      },
      {
        type: "steps",
        title: "كيف يعمل الحل في موقف الاستخدام؟",
        steps: [
          { key: "experienceStart", label: "بداية التجربة", tone: "teal", rows: 3 },
          { key: "mainInteraction", label: "التفاعل الرئيس", tone: "honey", rows: 3 },
          { key: "beneficiaryOutcome", label: "النتيجة للمستفيد", tone: "purple", rows: 3 },
        ],
      },
      {
        type: "row",
        cols: 2,
        fields: [
          { key: "valueOffered", label: "القيمة التي يقدمها", hint: "ما التحسن المحدد الذي سيشعر به المستفيد؟", tone: "teal", rows: 3 },
          {
            key: "coreFunction",
            label: "الوظيفة الأساسية التي سيختبرها الفريق",
            hint: "ما الجزء الذي يجب أن يعمل حتى يستحق الحل الاستمرار؟",
            tone: "coral",
            rows: 3,
          },
        ],
      },
    ],
  },
  {
    key: "value-proposition",
    number: 8,
    title: "لوحة القيمة المقترحة",
    subtitle: "تربط أولويات المستفيد بما يقدمه الحل، وتحدد نقاط التطابق التي تحتاج إلى اختبار",
    sections: [
      {
        type: "panels",
        template: "lg:grid-cols-[1.15fr_0.55fr_1.15fr]",
        panels: [
          {
            title: "ملف المستفيد",
            tone: "purple",
            variant: "circle",
            sections: [
              {
                type: "row",
                cols: 1,
                fields: [
                  { key: "gains", label: "المكاسب", hint: "ما الذي يريد المستفيد تحقيقه أو تحسينه؟", tone: "purple", rows: 3 },
                  { key: "jobs", label: "المهام", hint: "ما الذي يحاول إنجازه في هذا السياق؟", tone: "purple", rows: 3 },
                  { key: "pains", label: "الآلام", hint: "ما الذي يعطله أو يسبب له صعوبة؟", tone: "coral", rows: 3 },
                ],
              },
            ],
          },
          {
            title: "التطابق",
            tone: "honey",
            variant: "outline",
            sections: [
              { type: "heading", text: "نقاط تحتاج إلى اختبار" },
              {
                type: "row",
                cols: 1,
                fields: [1, 2, 3].map((i) => ({ key: `fitPoint${i}`, label: `${i}`, tone: "honey" as PracticeTone, rows: 2 })),
              },
            ],
          },
          {
            title: "خريطة القيمة",
            tone: "teal",
            variant: "outline",
            sections: [
              {
                type: "row",
                cols: 1,
                fields: [
                  { key: "gainCreators", label: "صانعات المكاسب", hint: "كيف يساعد الحل المستفيد على تحقيق مكاسب مهمة؟", tone: "teal", rows: 3 },
                  { key: "productsServices", label: "المنتجات والخدمات", hint: "ما الذي يقدمه الحل فعليًا؟", tone: "purple", rows: 3 },
                  { key: "painRelievers", label: "مسكنات الآلام", hint: "كيف يخفف الحل ألمًا ذا أولوية؟", tone: "coral", rows: 3 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "theory-of-change",
    number: 9,
    title: "نموذج مسار التغيير والأثر",
    subtitle: "يبيّن كيف تنتقل موارد الحل وأنشطته إلى نتائج قابلة للقياس ثم إلى أثر أبعد",
    sections: [
      {
        type: "columns",
        arrows: true,
        columns: (
          [
            ["problemGroup", "المشكلة والفئة", "ما الوضع الذي نريد تغييره؟", "purple"],
            ["inputs", "المدخلات", "ما الموارد والشراكات المطلوبة؟", "teal"],
            ["activities", "الأنشطة", "ماذا سينفذ الحل؟", "honey"],
            ["outputs", "المخرجات", "ما الذي سينتج مباشرة؟", "coral"],
            ["outcomes", "النتائج", "ما التغير قصير أو متوسط المدى؟", "teal"],
            ["impact", "الأثر", "ما التغير الأبعد الذي يسهم فيه الحل؟", "purple"],
          ] as const
        ).map(([key, title, hint, tone]) => ({ title, hint, tone, fields: [{ key, label: title, rows: 6 }] })),
      },
      {
        type: "banner",
        tone: "honey",
        fields: [{ key: "keyAssumptions", label: "الافتراضات الرئيسة", hint: "ما الذي يجب أن يتحقق حتى ينتقل التغيير من مرحلة إلى أخرى؟", rows: 2 }],
      },
      {
        type: "banner",
        tone: "teal",
        fields: [{ key: "earlyIndicators", label: "المؤشرات الأولية", hint: "ما الشاهد الذي سيبين تحقق المخرج أو النتيجة؟", rows: 2 }],
      },
    ],
  },
  {
    key: "prototype-test-plan",
    number: 10,
    title: "بطاقة تخطيط النموذج الأولي والاختبار",
    subtitle: "تحدد البطاقة ما سيختبره الفريق وكيف سيجمع دليلًا يساعده على اتخاذ قرار",
    sections: [
      {
        type: "row",
        cols: 4,
        fields: [
          { key: "projectName", label: "اسم المشروع", tone: "purple", kind: "text" },
          { key: "attemptNumber", label: "رقم المحاولة", tone: "teal", kind: "text" },
          { key: "testDate", label: "تاريخ الاختبار", tone: "honey", kind: "date" },
          { key: "testOwner", label: "مسؤول الاختبار", tone: "coral", kind: "text" },
        ],
      },
      {
        type: "row",
        cols: 1,
        fields: [{ key: "assumption", label: "الافتراض أو السؤال الذي سنختبره", hint: "اكتب افتراضًا واحدًا محددًا", tone: "purple", rows: 2 }],
      },
      {
        type: "row",
        cols: 2,
        fields: [
          { key: "prototype", label: "النموذج الأولي", hint: "ما الشكل الأبسط الذي يسمح بالتعلم؟ ما الوظيفة التي سيعرضها؟", tone: "teal", rows: 4 },
          { key: "testMethod", label: "طريقة الاختبار", hint: "من سيشارك؟ أين؟ ما المهمة التي سيؤديها؟ ما الذي سنلاحظه؟", tone: "honey", rows: 4 },
        ],
      },
      {
        type: "row",
        cols: 3,
        fields: [
          { key: "groupSize", label: "الفئة وعدد المشاركين", tone: "teal", rows: 2 },
          { key: "placeChannel", label: "المكان أو القناة", tone: "honey", rows: 2 },
          { key: "timing", label: "الزمن والموعد", tone: "coral", rows: 2 },
        ],
      },
      {
        type: "row",
        cols: 2,
        fields: [
          { key: "resources", label: "الموارد والاحتياجات", hint: "مواد، أجهزة، أدوار، موافقات", tone: "purple", rows: 2 },
          { key: "decisionCriteria", label: "معيار اتخاذ القرار", hint: "متى نستمر؟ متى نعدل؟ متى نعيد الاختبار؟", tone: "teal", rows: 2 },
        ],
      },
    ],
  },
  {
    key: "feedback-lessons",
    number: 11,
    title: "بطاقة ردود الفعل والدروس المستفادة",
    subtitle: "تجمع البطاقة صوت كل مستخدم أولًا، ثم تساعد الفريق على استخلاص قرار الجولة التالية",
    sections: [
      {
        type: "panels",
        template: "lg:grid-cols-2",
        panels: [
          {
            title: "بطاقة رد الفعل الفردية",
            tone: "teal",
            sections: [
              { type: "row", cols: 1, fields: [{ key: "sessionData", label: "بيانات الجلسة والمشارك", tone: "teal", rows: 2 }] },
              {
                type: "row",
                cols: 2,
                fields: [
                  { key: "didntWork", label: "ما الذي لم يعمل؟", hint: "اقتباس أو موقف محدد", tone: "coral", rows: 3 },
                  { key: "liked", label: "ما أعجب المشارك؟", hint: "اقتباس أو موقف محدد", tone: "teal", rows: 3 },
                  { key: "suggestions", label: "اقتراحاته", tone: "purple", rows: 3 },
                  { key: "questions", label: "أسئلة المشارك", tone: "honey", rows: 3 },
                ],
              },
              {
                type: "row",
                cols: 1,
                fields: [{ key: "keyObservation", label: "الملاحظة الأهم", hint: "ما السلوك أو العبارة التي تستحق العودة إليها؟", tone: "teal", rows: 3 }],
              },
            ],
          },
          {
            title: "بطاقة التعلم بعد الجولة",
            tone: "purple",
            sections: [
              { type: "row", cols: 1, fields: [{ key: "sharedPatterns", label: "الأنماط المشتركة", hint: "ما الذي تكرر بين المشاركين؟", tone: "purple", rows: 3 }] },
              {
                type: "row",
                cols: 1,
                fields: [{ key: "conflictingNotes", label: "الملاحظات المتعارضة", hint: "ما الذي اختلف؟ وما الذي يحتاج تحققًا؟", tone: "honey", rows: 3 }],
              },
              { type: "row", cols: 1, fields: [{ key: "learned", label: "ما الذي تعلمناه؟", hint: "ماذا تغير في فهمنا للحل أو المستفيد؟", tone: "teal", rows: 3 }] },
              {
                type: "row",
                cols: 1,
                fields: [
                  { key: "nextRoundDecision", label: "قرار الجولة التالية", tone: "coral", kind: "choice", options: ["نستمر", "نعدل", "نعيد الاختبار"] },
                  { key: "nextRoundChange", label: "ما التعديل؟ ولماذا؟", tone: "coral", rows: 3 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "final-project-board",
    number: 12,
    title: "لوحة المشروع النهائية",
    subtitle: "تلخص ما اعتمده الفريق من النماذج السابقة، وتعرض الحل ودليله وحدود أثره في صفحة واحدة",
    sections: [
      {
        type: "row",
        cols: 3,
        fields: [
          { key: "projectName", label: "اسم المشروع", tone: "purple", kind: "text" },
          { key: "challenge", label: "التحدي الذي يعالجه", tone: "coral", rows: 2 },
          { key: "targetGroup", label: "الفئة المستهدفة", tone: "teal", rows: 2 },
        ],
      },
      {
        type: "row",
        cols: 3,
        fields: [
          { key: "problemEvidence", label: "المشكلة والشاهد", hint: "ما المشكلة؟ وما الدليل الذي يدعمها؟", tone: "purple", rows: 4 },
          { key: "conceptMechanism", label: "مفهوم الحل وآلية عمله", hint: "ماذا يقدم؟ وكيف يستخدمه المستفيد؟", tone: "teal", rows: 4 },
          { key: "beneficiaryValue", label: "القيمة للمستفيد", hint: "ما التحسن المحدد الذي يصنعه الحل؟", tone: "honey", rows: 4 },
        ],
      },
      {
        type: "row",
        cols: 3,
        fields: [
          { key: "whatTested", label: "ما الذي اختبرناه؟", hint: "النموذج، الفئة، وسياق الاختبار", tone: "coral", rows: 4 },
          { key: "learnedAdjusted", label: "ما الذي تعلمناه وعدّلناه؟", hint: "أهم دليل وقرار نتج عنه", tone: "purple", rows: 4 },
          { key: "expectedResults", label: "المخرجات والنتائج المتوقعة", hint: "ما الذي سينتج؟ وما التغير المتوقع؟", tone: "teal", rows: 4 },
        ],
      },
      {
        type: "row",
        cols: 3,
        fields: [
          { key: "resourcesPartners", label: "الموارد والشركاء", hint: "ما المطلوب للانتقال إلى التنفيذ؟", tone: "teal", rows: 4 },
          { key: "nextStep", label: "الخطوة التالية", hint: "ما القرار أو التجربة التالية؟", tone: "honey", rows: 4 },
          { key: "claimLimits", label: "حدود ما يدعيه المشروع", hint: "ما الذي تدعمه الأدلة حاليًا؟ وما الذي ما زال افتراضًا؟", tone: "coral", rows: 4 },
        ],
      },
    ],
  },
];

export const PRACTICE_CARD_COUNT = PRACTICE_CARDS.length;
export const PRACTICE_MAX_SCORE = 5;
/** Longest answer kept per field */
export const PRACTICE_FIELD_MAX_LENGTH = 5000;

export function getPracticeCard(key: string): PracticeCard | undefined {
  return PRACTICE_CARDS.find((card) => card.key === key);
}

/** Every field of a card, in reading order. */
export function practiceCardFields(card: PracticeCard): PracticeField[] {
  const out: PracticeField[] = [];
  const walk = (sections: PracticeSection[]) => {
    for (const s of sections) {
      if (s.type === "row" || s.type === "banner") out.push(...s.fields);
      else if (s.type === "matrix") out.push(...s.cells);
      else if (s.type === "tree") out.push(...s.top, s.center, ...s.bottom.flat());
      else if (s.type === "columns") s.columns.forEach((c) => out.push(...c.fields));
      else if (s.type === "steps") out.push(...s.steps);
      else if (s.type === "panels") s.panels.forEach((p) => walk(p.sections));
    }
  };
  walk(card.sections);
  return out;
}

export type PracticeAnswers = Record<string, string>;

/**
 * Keep only the card's own fields, as trimmed strings within the length limit;
 * a choice field keeps only one of its options. Used on every save.
 */
export function sanitizePracticeAnswers(card: PracticeCard, raw: unknown): PracticeAnswers {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: PracticeAnswers = {};
  for (const field of practiceCardFields(card)) {
    const value = input[field.key];
    if (typeof value !== "string") continue;
    const text = value.slice(0, PRACTICE_FIELD_MAX_LENGTH).trim();
    if (!text) continue;
    if (field.kind === "choice" && !field.options?.includes(text)) continue;
    out[field.key] = text;
  }
  return out;
}

/** Parse a stored answers column; anything unreadable counts as empty. */
export function parsePracticeAnswers(json: string | null | undefined): PracticeAnswers {
  try {
    const value = JSON.parse(json || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export type PracticeStatus = "not_started" | "draft" | "submitted" | "needs_revision" | "approved";

export const PRACTICE_STATUS_LABELS: Record<PracticeStatus, string> = {
  not_started: "لم يبدأ",
  draft: "مسودة",
  submitted: "بانتظار المراجعة",
  needs_revision: "مطلوب تعديل",
  approved: "مكتمل",
};

/** The leader may write only before submitting, or after a card comes back for correction. */
export function isPracticeEditable(status: PracticeStatus): boolean {
  return status === "not_started" || status === "draft" || status === "needs_revision";
}

/** Reviewers act on cards waiting for review, and may revise an approved card's review. */
export function isPracticeReviewable(status: PracticeStatus): boolean {
  return status === "submitted" || status === "approved";
}

export const PRACTICE_DECISION_LABELS: Record<"approved" | "needs_revision", string> = {
  approved: "اعتماد البطاقة",
  needs_revision: "إعادة للتعديل",
};
