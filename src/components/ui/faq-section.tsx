"use client";
import React, { useState } from "react";

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
  iconPath?: string;
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
  iconPath = "/Path 19188.png",
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
    <div className="faq-container" dir="rtl">
      {/* Main FAQ Title */}
      <div className="faq-header">
        <div className="title-with-icon">
          <h2 className="faq-title" style={{ color: "#620F10" }}>
            {title}
          </h2>
          <img
            src={iconPath}
            alt="FAQ Icon"
            className="faq-icon"
          />
        </div>
      </div>

      {/* FAQ Categories */}
      <div className="faq-content">
        {faqData.map((category, categoryIndex) => (
          <div key={category.id} className="faq-category">
            {/* Category Title */}
            <h3 className="category-title" style={{ color: titleColor }}>
              {category.category}
            </h3>

            {/* Questions List */}
            <div className="questions-list">
              {category.questions.map((question, questionIndex) => (
                <div key={question.id} className="question-item">
                  {/* Separator Line */}
                  <div className="separator-line"></div>
                  
                  {/* Question Row */}
                  <div 
                    className="question-row"
                    onClick={() => toggleQuestion(question.id)}
                  >
                    <div className="question-text">
                      {question.question}
                    </div>
                    <div className={`arrow-icon ${expandedQuestions.has(question.id) ? 'expanded' : ''}`}>
                      <img
                        src="/Path 19189.svg"
                        alt="Arrow"
                        className="arrow-svg"
                      />
                    </div>
                  </div>

                  {/* Answer (Expandable) */}
                  <div className={`answer-container ${expandedQuestions.has(question.id) ? 'expanded' : ''}`}>
                    <div className="answer-text">
                      {question.answer}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .faq-container {
          width: 100%;
          padding: 4rem 2rem;
          background: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          min-height: 300px;
        }

        .faq-header {
          max-width: 1600px;
          width: 100%;
          display: flex;
          justify-content: flex-start;
          margin-bottom: 3rem;
          padding-right: 2rem;
        }

        .title-with-icon {
          display: flex;
          align-items: center;
          gap: 1rem;
          opacity: 0;
          transform: translateY(30px) scale(0.9);
          animation: fadeInScale 0.8s ease-out 0.2s forwards;
        }

        .faq-icon {
          width: 48px;
          height: 48px;
          object-fit: contain;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
        }

        .faq-title {
          font-size: 40px;
          font-weight: bold;
          margin: 0;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
          font-family: 'Somar-Bold', 'Arial', sans-serif;
        }

        .faq-content {
          max-width: 1600px;
          width: 100%;
        }

        .faq-category {
          margin-bottom: 3rem;
          opacity: 0;
          transform: translateY(20px);
          animation: fadeInUp 0.6s ease-out forwards;
        }

        .faq-category:nth-child(1) { animation-delay: 0.3s; }
        .faq-category:nth-child(2) { animation-delay: 0.4s; }
        .faq-category:nth-child(3) { animation-delay: 0.5s; }
        .faq-category:nth-child(4) { animation-delay: 0.6s; }
        .faq-category:nth-child(5) { animation-delay: 0.7s; }

        .category-title {
          font-size: 32px;
          font-weight: bold;
          margin: 0 0 2rem 0;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
          font-family: 'Somar-Bold', 'Arial', sans-serif;
          text-align: right;
          padding-right: 2rem;
        }

        .questions-list {
          width: 100%;
        }

        .question-item {
          margin-bottom: 0.5rem;
        }

        .separator-line {
          width: 100%;
          height: 1px;
          background: #e0e0e0;
          margin-bottom: 1rem;
        }

        .question-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 2rem;
          cursor: pointer;
          transition: all 0.3s ease;
          border-radius: 8px;
        }

        .question-row:hover {
          background: rgba(98, 15, 16, 0.05);
        }

        .question-text {
          font-size: 28px;
          font-weight: 500;
          color: #620F10;
          font-family: 'Somar-Bold', 'Arial', sans-serif;
          flex: 1;
          text-align: right;
        }

        .arrow-icon {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }

        .arrow-icon.expanded {
          transform: rotate(180deg);
        }

        .arrow-svg {
          width: 20px;
          height: 20px;
          object-fit: contain;
          transition: all 0.3s ease;
        }

        .answer-container {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.4s ease, padding 0.4s ease;
          padding: 0 2rem;
        }

        .answer-container.expanded {
          max-height: 500px;
          padding: 1rem 2rem 2rem 2rem;
        }

        .answer-text {
          font-size: 1.5rem;
          line-height: 1.6;
          color: #620F10;
          font-family: 'Somar-Light', 'Arial', sans-serif;
          font-weight: 300;
          text-align: right;
          white-space: pre-line;
          opacity: 0;
          transform: translateY(-10px);
          transition: opacity 0.3s ease 0.1s, transform 0.3s ease 0.1s;
        }

        .answer-container.expanded .answer-text {
          opacity: 1;
          transform: translateY(0);
        }

        @keyframes fadeInScale {
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes fadeInUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .faq-container {
            padding: 3rem 1rem;
          }

          .faq-header {
            padding-right: 1rem;
            margin-bottom: 2rem;
          }

          .faq-title {
            font-size: 1.5rem;
          }

          .faq-icon {
            width: 36px;
            height: 36px;
          }

          .category-title {
            font-size: 1.25rem;
            padding-right: 1rem;
            margin-bottom: 1.5rem;
          }

          .question-row {
            padding: 0.75rem 1rem;
          }

          .question-text {
            font-size: 18px;
          }

          .answer-container {
            padding: 0 1rem;
          }

          .answer-container.expanded {
            padding: 0.75rem 1rem 1.5rem 1rem;
          }

          .answer-text {
            font-size: 0.9rem;
          }
        }

        @media (max-width: 480px) {
          .faq-container {
            padding: 2rem 0.5rem;
          }

          .faq-header {
            padding-right: 0.5rem;
          }

          .faq-title {
            font-size: 1.25rem;
          }

          .faq-icon {
            width: 32px;
            height: 32px;
          }

          .category-title {
            font-size: 1.1rem;
            padding-right: 0.5rem;
          }

          .question-row {
            padding: 0.5rem 0.75rem;
          }

          .question-text {
            font-size: 18px;
          }

          .arrow-icon {
            font-size: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
