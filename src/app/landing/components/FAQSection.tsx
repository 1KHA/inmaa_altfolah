"use client";
import React, { useState } from "react";

import faqIcon from "../assets/faq-icon.png";
import faqArrow from "../assets/faq-arrow.svg";

interface FAQQuestion {
  id: string;
  question: string;
  answer: string;
}

interface FAQCategory {
  id: string;
  category: string;
  questions: FAQQuestion[];
}

interface FAQSectionProps {
  title?: string;
  titleColor?: string;
  faqData?: FAQCategory[];
}

const defaultFAQData: FAQCategory[] = [
  {
    id: "hackathon",
    category: "الأسئلة المتعلقة بالهاكاثون",
    questions: [
      {
        id: "hack0",
        question: "ما هو الهاكاثون؟",
        answer: "الهاكاثون هو تحدِ  يمتد لخمسة أيام، يجمع المشاركين لاستكشاف وتوظيف الابتكارات الجامعية، والعمل ضمن فرق تنافسية على تطوير حلول مبتكرة تسهم في تعزيز الاستدامة وجودة الحياة. \n\nسيقام في مقر جامعة دار الحكمة – مدينة جدة. سيركز الهاكاثون على المسارات التالية: إثراء تجربة ضيوف الرحمن في المدن المقدسة، تعزيز الدمج المجتمعي لكبار السن والمكفوفين، الحلول الاجتماعية المستدامة. ويتضمن الهاكاثون عدد من الفعاليات المصاحبة مثل الإرشاد والتوجيه، وورش العمل في المجالات المختلفة ذات العلاقة، والاستشارات المتخصصة. \n\n \n\n وسيكون إعلان الفائزين بتاريخ ٨ أكتوبر ٢٠٢٦م"
      },
      {
        id: "hack2",
        question: "من هم الفئات المستهدفة المشاركة في الجائزة؟",
        answer: " طالبات البكالوريوس والماجستير المبتكرات في الجامعات السعودية."
      }
    ]
  },
  {
    id: "registration",
    category: "الأسئلة المتعلقة بالتسجيل",
    questions: [
      {
        id: "reg1",
        question: "هل يجب على جميع أعضاء الفريق التسجيل؟",
        answer: "نعم، يجب أن يقوم جميع أعضاء الفريق بالتسجيل على نموذج المشاركة في الهاكاثون وسيتم إرسال رسائل القبول لكل أعضاء الفريق المشاركين."
      },
      {
        id: "reg2",
        question: "كم هو العدد الأقصى للفريق؟",
        answer: "الحد الأدنى هو 3 أعضاء والحد الأعلى هو5 أعضاء في الفريق.\n\nكما نوصي أن يكون الفريق متنوع وذوي خلفيات علمية ومهنية مختلفة كالبرمجة، التصميم، الهندسة، التمويل، الريادة...وغيرها حيث يشكل التنوع ميزة بالنسبة للفريق المشارك ويضيف له نقاط في التقييم."
      }
    ]
  },
  {
    id: "solutions",
    category: "الأسئلة المتعلقة عن تقديم الحلول في الهاكاثون",
    questions: [
      {
        id: "sol1",
        question: "هل مسموح تقديم الحل لفريق من شخص واحد؟",
        answer: "لا، وبحسب معايير التقييم المعتمدة، فإن المشاركة الفردية لا تُتاح إلا في حال إثبات القدرة على استكمال جميع جوانب الحل بشكل متكامل، وهو ما يصعب تحقيقه غالبًا خارج إطار الفريق. "
      },
      {
        id: "sol2",
        question: "هل يمكن العمل على أكثر من فكرة؟",
        answer: "لا يمكن، تعد هذه فرصة لتطوير وتنقيح الأفكار والابتكارات، لكن سيتم استلام مشروع واحد لكل فريق."
      }
    ]
  },
  {
    id: "communication",
    category: "الأسئلة المتعلقة بالتواصل",
    questions: [
      {
        id: "comm1",
        question: "ماهي فترة تأكيد المشاركة في الهاكاثون؟",
        answer: "فترة تأكيد المشاركة في الهاكاثون تمتد من 13 إلى 30 سبتمبر 2026م"
      },
      {
        id: "comm2",
        question: "ماهي طرق التواصل مع فريق الدعم الفني؟",
        answer: "للرد على الاستفسارات والإجابة على تساؤلاتكم يمكنكم التواصل عبر: \n\nwmvc@wadimakkah.sa\n\n+966 557552166"
      }
    ]
  },
  {
    id: "ideas",
    category: "أسئلة عن الأفكار المشاركة",
    questions: [
      {
        id: "idea1",
        question: "هل يمكن تعديل الحل المقدم؟",
        answer: "نعم، ستمر جميع الأفكار المشاركة على لجنة تقوم باختيار وفرز المشاركين بناءً على الأفكار المشاركة، وخلال فترة الهاكاثون سيحصل المشارك على جلسات إرشادية واستشارات متخصصة تساعد في بلورة وتطوير الأفكار المشاركة بمساعدة اللجان المشاركة؛ هذه فرصة لتحسين وتعديل المخرج النهائي بشرط ألا يكون التغيير جوهري يغير من المعنى النهائي للفكرة المقبولة مسبقًا."
      },
      {
        id: "idea2",
        question: "ما هو النموذج الأولي؟؟",
        answer: "هو النسخة الأولية للفكرة المشاركة وتَصور لخصائص المنتج النهائي الذي لا يزال قيد التطوير والاختبار، ويعتبر النموذج الأولي أداة تساعد في تحسين فرص نجاح المنتج ، وتفادي للأخطاء المكلفة من خلال اختباره قبل إنشاء المنتج النهائي."
      },
      {
        id: "idea3",
        question: "هل يتطلب تقديم نموذج أولي للتسجيل؟",
        answer: "لا، ولكن يمنح الفريق المقدم ميزة إضافية للقبول."
      }
    ]
  },
];

export default function FAQSection({
  title = "الأسئلة الشائعة",
  titleColor = "#3CD1EE",
  faqData = defaultFAQData,
}: FAQSectionProps) {
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());

  const toggleQuestion = (questionId: string) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId);
    } else {
      newExpanded.add(questionId);
    }
    setExpandedQuestions(newExpanded);
  };

  return (
    <div className="dhl-faq" dir="rtl" data-reveal="group">
      <div className="dhl-faq-header">
        <div className="dhl-faq-title-row">
          <h2 className="dhl-faq-title">{title}</h2>
          <img src={faqIcon.src} alt="FAQ Icon" className="dhl-faq-icon" />
        </div>
      </div>

      <div className="dhl-faq-content">
        {faqData.map((category) => (
          <div key={category.id} className="dhl-faq-category">
            <h3 className="dhl-faq-cat-title" style={{ color: titleColor }}>
              {category.category}
            </h3>
            <div>
              {category.questions.map((question) => (
                <div key={question.id} className="dhl-faq-item">
                  <div className="dhl-faq-sep"></div>
                  <div className="dhl-faq-qrow" onClick={() => toggleQuestion(question.id)}>
                    <div className="dhl-faq-qtext">{question.question}</div>
                    <div className={`dhl-faq-arrow ${expandedQuestions.has(question.id) ? "expanded" : ""}`}>
                      <img src={faqArrow.src} alt="Arrow" />
                    </div>
                  </div>
                  <div className={`dhl-faq-answer ${expandedQuestions.has(question.id) ? "expanded" : ""}`}>
                    <div className="dhl-faq-atext">{question.answer}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
