"use client";
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomIcon from '@/app/components/CustomIcon';

type DocType = 'processing' | 'privacy' | 'terms' | 'cookies';

const sections: Array<{
  id: DocType;
  navLabel: string;
  title: string;
  meta: string;
  blocks: Array<
    | { kind: 'text'; title: string; text: string }
    | { kind: 'list'; title: string; intro?: string; items: string[] }
  >;
}> = [
  {
    id: 'processing',
    navLabel: 'Обработка персональных данных',
    title: 'Согласие на обработку персональных данных',
    meta: 'Для учётных записей сокращённого бета-теста',
    blocks: [
      {
        kind: 'text',
        title: '1. Что включает в себя согласие',
        text:
          'Учётную запись на платформе Ватэс создаёт администратор. В сокращённом бета-тесте сотрудник входит по выданным логину и паролю без отдельной регистрации. Для работы учебных разделов используются данные учётной записи, профиля и учебного прогресса.',
      },
      {
        kind: 'list',
        title: '2. Перечень обрабатываемых данных',
        intro: 'Для обеспечения учебного процесса и авторизации в системе обработке подлежат следующие данные:',
        items: [
          'Фамилия, Имя, Отчество для формирования личного профиля.',
          'Логин, данные авторизации и аватар профиля.',
          'Статистика успеваемости, логи авторизации и результаты прохождения тестирований.',
        ],
      },
      {
        kind: 'text',
        title: '3. Цели обработки данных',
        text:
          'Персональные данные пользователей обрабатываются исключительно в целях предоставления доступа к базе знаний, контроля прохождения учебных курсов, проведения аттестаций стажеров и бариста, а также предотвращения несанкционированного доступа к конфиденциальной информации компании через систему Vates Guard.',
      },
    ],
  },
  {
    id: 'privacy',
    navLabel: 'Политика конфиденциальности',
    title: 'Политика в отношении обработки персональных данных',
    meta: 'Актуальная редакция документа',
    blocks: [
      {
        kind: 'text',
        title: '1. Общие положения',
        text:
          'Настоящая политика обработки персональных данных составлена в соответствии с требованиями Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных» и определяет порядок обработки персональных данных и меры по обеспечению безопасности персональных данных, предпринимаемые ООО Чайная Артель. Оператор ставит своей важнейшей целью соблюдение прав и свобод человека и гражданина при обработке его персональных данных, включая защиту права на неприкосновенность частной жизни, личную и семейную тайну. Политика применяется ко всей информации, которую Оператор может получить о посетителях веб-сайта https://tea-hub.ru/tasks?tab=edu.',
      },
      {
        kind: 'list',
        title: '2. Основные понятия, используемые в Политике',
        items: [
          'Автоматизированная обработка персональных данных — обработка персональных данных с помощью средств вычислительной техники.',
          'Блокирование персональных данных — временное прекращение обработки персональных данных, кроме случаев, когда обработка необходима для уточнения персональных данных.',
          'Веб-сайт — совокупность графических и информационных материалов, а также программ для ЭВМ и баз данных, обеспечивающих их доступность в сети интернет по адресу https://tea-hub.ru/tasks?tab=edu.',
          'Информационная система персональных данных — совокупность содержащихся в базах данных персональных данных и обеспечивающих их обработку информационных технологий и технических средств.',
          'Обезличивание персональных данных — действия, в результате которых невозможно определить без использования дополнительной информации принадлежность персональных данных конкретному Пользователю или иному субъекту персональных данных.',
          'Обработка персональных данных — любое действие или совокупность действий с персональными данными, включая сбор, запись, систематизацию, накопление, хранение, уточнение, извлечение, использование, передачу, обезличивание, блокирование, удаление и уничтожение.',
          'Оператор — юридическое или физическое лицо, которое самостоятельно или совместно с другими лицами организует и осуществляет обработку персональных данных, а также определяет цели и состав такой обработки.',
          'Персональные данные — любая информация, относящаяся прямо или косвенно к определенному или определяемому Пользователю веб-сайта.',
          'Персональные данные, разрешенные субъектом для распространения, — данные, доступ к которым предоставлен неограниченному кругу лиц по согласию субъекта персональных данных.',
          'Пользователь — любой посетитель веб-сайта https://tea-hub.ru/tasks?tab=edu.',
          'Предоставление персональных данных — действия, направленные на раскрытие персональных данных определенному лицу или определенному кругу лиц.',
          'Распространение персональных данных — любые действия, направленные на раскрытие персональных данных неопределенному кругу лиц.',
          'Трансграничная передача персональных данных — передача персональных данных на территорию иностранного государства.',
          'Уничтожение персональных данных — действия, в результате которых персональные данные уничтожаются безвозвратно без возможности восстановления.',
        ],
      },
      {
        kind: 'list',
        title: '3. Основные права и обязанности Оператора',
        items: [
          'Оператор имеет право получать от субъекта персональных данных достоверную информацию и документы, содержащие персональные данные.',
          'При отзыве субъектом персональных данных согласия на обработку персональных данных Оператор вправе продолжить обработку без такого согласия при наличии оснований, указанных в Законе о персональных данных.',
          'Оператор вправе самостоятельно определять состав и перечень мер, необходимых и достаточных для обеспечения выполнения обязанностей, предусмотренных законодательством.',
          'Оператор обязан предоставлять субъекту персональных данных по его просьбе информацию, касающуюся обработки его персональных данных.',
          'Оператор обязан организовывать обработку персональных данных в порядке, установленном действующим законодательством Российской Федерации.',
          'Оператор обязан отвечать на обращения и запросы субъектов персональных данных и их законных представителей.',
          'Оператор обязан сообщать в уполномоченный орган необходимую информацию по запросу в течение 10 дней.',
          'Оператор обязан обеспечивать неограниченный доступ к настоящей Политике.',
          'Оператор обязан принимать правовые, организационные и технические меры для защиты персональных данных.',
          'Оператор обязан прекратить передачу, обработку и уничтожить персональные данные в случаях, предусмотренных законом.',
        ],
      },
      {
        kind: 'list',
        title: '4. Основные права и обязанности субъектов персональных данных',
        items: [
          'Субъекты персональных данных вправе получать информацию, касающуюся обработки их персональных данных, кроме случаев, предусмотренных федеральными законами.',
          'Субъекты персональных данных вправе требовать уточнения, блокирования или уничтожения персональных данных, если они являются неполными, устаревшими, неточными, незаконно полученными или не нужны для заявленной цели обработки.',
          'Субъекты персональных данных вправе выдвигать условие предварительного согласия при обработке персональных данных в целях продвижения на рынке товаров, работ и услуг.',
          'Субъекты персональных данных вправе отозвать согласие на обработку персональных данных и направить требование о прекращении обработки.',
          'Субъекты персональных данных вправе обжаловать неправомерные действия или бездействие Оператора в уполномоченный орган или в суд.',
          'Субъекты персональных данных обязаны предоставлять Оператору достоверные данные о себе и сообщать об их уточнении или изменении.',
          'Лица, передавшие Оператору недостоверные сведения о себе либо о другом субъекте без его согласия, несут ответственность в соответствии с законодательством Российской Федерации.',
        ],
      },
      {
        kind: 'list',
        title: '5. Принципы обработки персональных данных',
        items: [
          'Обработка персональных данных осуществляется на законной и справедливой основе.',
          'Обработка персональных данных ограничивается достижением конкретных, заранее определенных и законных целей.',
          'Не допускается обработка персональных данных, несовместимая с целями их сбора.',
          'Не допускается объединение баз данных, содержащих персональные данные, обработка которых осуществляется в целях, несовместимых между собой.',
          'Обработке подлежат только персональные данные, которые отвечают целям их обработки.',
          'Содержание и объем обрабатываемых персональных данных соответствуют заявленным целям обработки.',
          'При обработке персональных данных обеспечивается точность, достаточность и актуальность персональных данных.',
          'Хранение персональных данных осуществляется не дольше, чем этого требуют цели обработки, если иной срок не установлен законом.',
        ],
      },
      {
        kind: 'list',
        title: '6. Цели обработки персональных данных',
        intro: 'Цель обработки — доступ к учебным материалам, учёт прогресса и уведомления внутри личного кабинета.',
        items: [
          'Персональные данные: фамилия, имя, отчество.',
          'Данные учётной записи, аватар и учебный прогресс.',
          'Правовые основания: уставные и учредительные документы Оператора.',
          'Правовые основания: договоры, заключаемые между Оператором и субъектом персональных данных.',
          'Виды обработки персональных данных: хранение учебного прогресса и отображение сообщений в личном кабинете.',
        ],
      },
      {
        kind: 'list',
        title: '7. Условия обработки персональных данных',
        items: [
          'Обработка персональных данных осуществляется с согласия субъекта персональных данных.',
          'Обработка необходима для достижения целей, предусмотренных международным договором Российской Федерации или законом.',
          'Обработка необходима для осуществления функций, полномочий и обязанностей, возложенных на оператора законодательством Российской Федерации.',
          'Обработка необходима для осуществления правосудия, исполнения судебного акта, акта другого органа или должностного лица.',
          'Обработка необходима для исполнения договора, стороной которого является субъект персональных данных, либо для заключения договора по инициативе субъекта.',
          'Обработка необходима для осуществления прав и законных интересов оператора или третьих лиц либо для достижения общественно значимых целей при условии, что не нарушаются права и свободы субъекта.',
          'Осуществляется обработка персональных данных, доступ к которым предоставлен субъектом персональных данных неограниченному кругу лиц либо по его просьбе.',
          'Осуществляется обработка персональных данных, подлежащих опубликованию или обязательному раскрытию в соответствии с федеральным законом.',
        ],
      },
      {
        kind: 'list',
        title: '8. Порядок сбора, хранения, передачи и других видов обработки персональных данных',
        intro:
          'Безопасность персональных данных обеспечивается путем реализации правовых, организационных и технических мер, необходимых для выполнения требований действующего законодательства в области защиты персональных данных.',
        items: [
          'Оператор обеспечивает сохранность персональных данных и принимает все возможные меры, исключающие доступ к персональным данным неуполномоченных лиц.',
          'Персональные данные Пользователя никогда не будут переданы третьим лицам, кроме случаев, связанных с исполнением действующего законодательства либо отдельного согласия субъекта персональных данных.',
          'В случае выявления неточностей Пользователь может актуализировать персональные данные, направив уведомление на адрес teacoffe@yandex.ru с пометкой «Актуализация персональных данных».',
          'Срок обработки персональных данных определяется достижением целей, для которых они были собраны, если иной срок не предусмотрен договором или законодательством.',
          'Пользователь может в любой момент отозвать свое согласие на обработку персональных данных, направив уведомление на адрес teacoffe@yandex.ru с пометкой «Отзыв согласия на обработку персональных данных».',
          'Информация, собираемая сторонними сервисами, хранится и обрабатывается указанными лицами в соответствии с их собственными документами. Оператор не несет ответственность за действия третьих лиц.',
          'Установленные субъектом персональных данных запреты на передачу и обработку данных, разрешенных для распространения, не действуют в случаях, определенных законодательством Российской Федерации.',
          'Оператор при обработке персональных данных обеспечивает конфиденциальность персональных данных.',
          'Оператор осуществляет хранение персональных данных в форме, позволяющей определить субъекта персональных данных, не дольше, чем этого требуют цели обработки.',
          'Условием прекращения обработки персональных данных может являться достижение целей обработки, истечение срока действия согласия, отзыв согласия, требование о прекращении обработки либо выявление неправомерной обработки.',
        ],
      },
      {
        kind: 'list',
        title: '9. Перечень действий, производимых Оператором с полученными персональными данными',
        items: [
          'Оператор осуществляет сбор, запись, систематизацию, накопление, хранение, уточнение, извлечение, использование, передачу, обезличивание, блокирование, удаление и уничтожение персональных данных.',
          'Оператор осуществляет автоматизированную обработку персональных данных с получением и/или передачей информации по информационно-телекоммуникационным сетям или без таковой.',
        ],
      },
      {
        kind: 'list',
        title: '10. Трансграничная передача персональных данных',
        items: [
          'До начала осуществления трансграничной передачи персональных данных Оператор обязан уведомить уполномоченный орган по защите прав субъектов персональных данных о своем намерении.',
          'До подачи указанного уведомления Оператор обязан получить от органов власти иностранного государства, иностранных физических лиц и иностранных юридических лиц сведения, необходимые для планируемой трансграничной передачи персональных данных.',
        ],
      },
      {
        kind: 'text',
        title: '11. Конфиденциальность персональных данных',
        text:
          'Оператор и иные лица, получившие доступ к персональным данным, обязаны не раскрывать третьим лицам и не распространять персональные данные без согласия субъекта персональных данных, если иное не предусмотрено федеральным законом.',
      },
      {
        kind: 'list',
        title: '12. Заключительные положения',
        items: [
          'Пользователь может получить любые разъяснения по интересующим вопросам, касающимся обработки его персональных данных, обратившись к Оператору с помощью электронной почты teacoffe@yandex.ru.',
          'В данном документе будут отражены любые изменения политики обработки персональных данных Оператором. Политика действует бессрочно до замены ее новой версией.',
          'Актуальная версия Политики в свободном доступе расположена по адресу https://tea-hub.ru/privacy?doc=privacy#privacy.',
        ],
      },
    ],
  },
  {
    id: 'terms',
    navLabel: 'Пользовательское соглашение',
    title: 'Пользовательское соглашение',
    meta: 'Внутренний регламент использования платформы',
    blocks: [
      {
        kind: 'text',
        title: '1. Условия использования платформы',
        text:
          'Платформа Ватэс является закрытым внутренним корпоративным ресурсом. Доступ к платформе предоставляется сотрудникам, стажерам и руководящему составу исключительно для выполнения учебных задач, ознакомления со стандартами сервиса и матрицей ассортимента.',
      },
      {
        kind: 'text',
        title: '2. Обязанности пользователя',
        text:
          'Пользователь обязуется соблюдать конфиденциальность учетных данных и не передавать свой логин и пароль третьим лицам. Любая попытка копирования, скачивания или распространения учебных материалов за пределы компании рассматривается как нарушение внутреннего режима доступа к информации.',
      },
      {
        kind: 'text',
        title: '3. Ответственность',
        text:
          'В случае выявления фактов передачи аккаунта третьим лицам или умышленного распространения базы знаний администрация оставляет за собой право ограничить доступ к учетной записи и применить предусмотренные внутренними документами меры реагирования.',
      },
    ],
  },
  {
    id: 'cookies',
    navLabel: 'Соглашение с файлами cookie',
    title: 'Соглашение об использовании файлов cookie',
    meta: 'Технический регламент работы сессий',
    blocks: [
      {
        kind: 'text',
        title: '1. Что такое файлы cookie',
        text:
          'Cookie — это небольшие текстовые файлы, которые сохраняются на устройстве пользователя при посещении сайта. Они помогают поддерживать сеанс, хранить выбранные параметры и обеспечивать стабильную работу интерфейса.',
      },
      {
        kind: 'list',
        title: '2. Как cookie используются в Ватэс',
        intro: 'На платформе файлы cookie и связанные сессии используются только в служебных целях:',
        items: [
          'Сохранение состояния авторизации, чтобы не вводить пароль заново при переходе между разделами.',
          'Поддержка пользовательской сессии и локальных настроек интерфейса.',
          'Сохранение технических идентификаторов, необходимых для изолированной истории в AI-ассистенте.',
        ],
      },
      {
        kind: 'text',
        title: '3. Отказ от cookie',
        text:
          'Если пользователь выбирает вариант «НЕТ (только на сеанс)» в баннере, данные сохраняются только в пределах текущей сессии браузера. После закрытия вкладки или выхода из учетной записи эти временные данные удаляются автоматически.',
      },
    ],
  },
];

export default function PrivacyPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<DocType>('processing');
  const [isScrollTopVisible, setIsScrollTopVisible] = useState(false);
  const sectionRefs = useRef<Record<DocType, HTMLElement | null>>({
    processing: null,
    privacy: null,
    terms: null,
    cookies: null,
  });

  const syncSectionFromLocation = (behavior: ScrollBehavior) => {
    const params = new URLSearchParams(window.location.search);
    const requestedDoc = params.get('doc') as DocType | null;
    const targetId = requestedDoc && sectionRefs.current[requestedDoc] ? requestedDoc : 'processing';
    const scrollTarget = sectionRefs.current[targetId];

    setActiveSection(targetId);

    if (scrollTarget) {
      const top = scrollTarget.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({ top, behavior });
    }
  };

  useEffect(() => {
    window.requestAnimationFrame(() => {
      syncSectionFromLocation('auto');
    });

    const handleLocationChange = () => syncSectionFromLocation('auto');
    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);

    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setIsScrollTopVisible(window.scrollY > 240);

      const entries = sections.map(({ id }) => {
        const node = sectionRefs.current[id];
        if (!node) return { id, top: Number.POSITIVE_INFINITY };
        const { top } = node.getBoundingClientRect();
        return { id, top: Math.abs(top - 140) };
      });

      const closest = entries.sort((a, b) => a.top - b.top)[0];
      if (closest) {
        setActiveSection(closest.id);
      }
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const openSection = (id: DocType) => {
    router.replace(`/privacy?doc=${id}#${id}`, { scroll: false });
    setActiveSection(id);
    const target = sectionRefs.current[id];
    if (target) {
      const top = target.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/');
  };

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={pageWrapper} className="privacy-page">
      <div style={backgroundOverlay} className="privacy-background-photo" />
      <div style={backgroundShade} className="privacy-background-shade" />

      <div style={layoutShell} className="privacy-layout">
        <aside style={sidebarStyle} className="privacy-sidebar">
          <button onClick={handleBack} style={backBtnStyle} className="back-btn">
            Вернуться назад
          </button>

          <div style={sidebarTitleArea}>
            <p style={eyebrowStyle}>Документы</p>
            <h1 style={sidebarTitle}>Юридическая и сервисная информация</h1>
          </div>

          <nav style={navStyle}>
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => openSection(section.id)}
                className={`menu-item ${activeSection === section.id ? 'active' : ''}`}
                style={{
                  ...menuItemStyle,
                  color: activeSection === section.id ? '#fff' : '#95a19b',
                  background: activeSection === section.id ? 'rgba(11, 28, 24, 0.92)' : 'transparent',
                  borderColor: activeSection === section.id ? 'rgba(10, 186, 181, 0.45)' : 'rgba(255,255,255,0.08)',
                }}
              >
                {section.navLabel}
              </button>
            ))}
          </nav>
        </aside>

        <main style={contentAreaStyle} className="privacy-content">
          <section style={heroSectionStyle}>
            <p style={eyebrowStyle}>Ватэс</p>
            <h2 style={heroTitleStyle}>Политика, согласия и условия использования</h2>
            <p style={heroTextStyle}>
              На этой странице каждый документ открывается как отдельный смысловой блок, поэтому ссылка из футера или формы ведет сразу к нужному тексту.
            </p>
          </section>

          <div style={documentSurfaceStyle} className="privacy-document-surface">
            {sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                ref={(node) => {
                  sectionRefs.current[section.id] = node;
                }}
                style={docSectionStyle}
                className="privacy-doc-section"
              >
                <div style={sectionHeaderStyle}>
                  <p style={sectionMetaStyle}>{section.meta}</p>
                  <h3 style={contentTitle}>{section.title}</h3>
                </div>

                <div style={sectionBodyStyle}>
                  {section.blocks.map((block) => (
                    <div key={`${section.id}-${block.title}`} style={contentBlockStyle}>
                      <h4 style={subTitle}>{block.title}</h4>
                      {block.kind === 'text' ? (
                        <p style={textBlock}>{block.text}</p>
                      ) : (
                        <>
                          {block.intro ? <p style={textBlock}>{block.intro}</p> : null}
                          <ul style={listStyle}>
                            {block.items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </main>
      </div>

      <button
        type="button"
        className={`privacy-scroll-top ${isScrollTopVisible ? 'is-visible' : ''}`}
        onClick={handleScrollToTop}
        aria-label="Вернуться к началу страницы"
        title="Наверх"
      >
        <CustomIcon name="arrow-left" size={21} color="currentColor" accent="none" />
      </button>

      <style jsx global>{`
        html {
          scroll-behavior: smooth;
        }

        @keyframes privacyFadeUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .menu-item,
        .back-btn {
          transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, border-color 0.16s ease, color 0.16s ease !important;
        }

        .menu-item:hover {
          color: #ffffff !important;
          border-color: rgba(10, 186, 181, 0.45) !important;
          background: rgba(10, 186, 181, 0.12) !important;
          box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(10, 186, 181, 0.24) !important;
          transform: translateY(1px) scale(0.985) !important;
        }

        .privacy-doc-section {
          animation: privacyFadeUp 0.35s ease forwards;
        }

        .back-btn:hover {
          background: rgba(10, 186, 181, 0.14) !important;
          color: #ffffff !important;
          border-color: rgba(10, 186, 181, 0.45) !important;
          box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(10, 186, 181, 0.24) !important;
          transform: translateY(1px) scale(0.985) !important;
        }

        .menu-item:active,
        .back-btn:active {
          transform: translateY(2px) scale(0.97) !important;
          box-shadow: inset 0 3px 8px rgba(0, 0, 0, 0.24) !important;
        }

        .privacy-scroll-top {
          position: fixed;
          z-index: 40;
          right: 24px;
          bottom: 24px;
          display: grid;
          width: 48px;
          height: 48px;
          padding: 0;
          place-items: center;
          border: 1px solid rgba(10, 186, 181, 0.46);
          border-radius: 15px;
          background: rgba(10, 27, 24, 0.94);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
          color: #71d5ce;
          cursor: pointer;
          opacity: 0;
          pointer-events: none;
          transform: translateY(14px);
          transition: opacity 0.2s ease, transform 0.2s ease, background 0.2s ease;
          backdrop-filter: blur(14px);
        }

        .privacy-scroll-top.is-visible {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }

        .privacy-scroll-top svg {
          transform: rotate(90deg);
        }

        .privacy-scroll-top:hover,
        .privacy-scroll-top:focus-visible {
          background: rgba(10, 186, 181, 0.18);
          color: #b8fffa;
          outline: 0;
        }

        .privacy-scroll-top:active {
          transform: translateY(2px) scale(0.96);
        }

        html[data-theme="light"] .privacy-scroll-top {
          background: rgba(255, 255, 255, 0.94);
          color: #187f79;
          box-shadow: 0 12px 28px rgba(32, 67, 59, 0.16);
        }

        @media (max-width: 980px) {
          .privacy-layout {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
          }

          .privacy-sidebar {
            position: static !important;
            top: auto !important;
          }
        }

        @media (max-width: 720px) {
          .privacy-doc-section {
            padding: 28px 20px !important;
          }

          .privacy-scroll-top {
            right: 16px;
            bottom: max(16px, env(safe-area-inset-bottom));
            width: 46px;
            height: 46px;
          }
        }
      `}</style>
    </div>
  );
}

// --- СТИЛИ КОМПОНЕНТА ---
const pageWrapper: React.CSSProperties = {
  minHeight: '100vh',
  position: 'relative',
  padding: '24px',
  boxSizing: 'border-box',
  overflowX: 'hidden',
  backgroundColor: '#000',
};

const backgroundOverlay: React.CSSProperties = {
  position: 'absolute',
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundImage: 'url("https://u.9111s.ru/uploads/202402/17/a0254a12ef37da5aaf5c5646a30baab8.webp")',
  backgroundSize: 'cover',
  backgroundPosition: 'center center',
  zIndex: -2,
};

const backgroundShade: React.CSSProperties = {
  position: 'absolute',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'linear-gradient(180deg, rgba(3, 10, 8, 0.9) 0%, rgba(6, 8, 7, 0.96) 100%)',
  zIndex: -1,
};

const layoutShell: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '320px minmax(0, 1fr)',
  gap: '32px',
  width: '100%',
  maxWidth: '1380px',
  margin: '0 auto',
  boxSizing: 'border-box',
};

const sidebarStyle: React.CSSProperties = {
  position: 'sticky',
  top: '24px',
  alignSelf: 'start',
  background: 'rgba(8, 13, 12, 0.88)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '28px',
  padding: '28px',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  backdropFilter: 'blur(18px)',
};

const backBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#d8e0dc',
  borderRadius: '16px',
  fontSize: '14px',
  fontWeight: '800',
  cursor: 'pointer',
  transition: '0.2s ease',
  marginBottom: '28px',
};

const sidebarTitleArea: React.CSSProperties = {
  marginBottom: '24px',
};

const eyebrowStyle: React.CSSProperties = {
  margin: '0 0 10px 0',
  color: '#0abab5',
  fontSize: '12px',
  fontWeight: '800',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
};

const sidebarTitle: React.CSSProperties = {
  margin: 0,
  color: '#fff',
  fontSize: '28px',
  fontWeight: '900',
  lineHeight: '1.12',
};

const sidebarNote: React.CSSProperties = {
  margin: '14px 0 0 0',
  color: '#92a09a',
  fontSize: '14px',
  lineHeight: '1.55',
};

const navStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

const menuItemStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  padding: '16px 18px',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px',
  fontSize: '14px',
  fontWeight: '700',
  cursor: 'pointer',
  lineHeight: '1.3',
  boxSizing: 'border-box',
};

const contentAreaStyle: React.CSSProperties = {
  minWidth: 0,
  boxSizing: 'border-box',
};

const heroSectionStyle: React.CSSProperties = {
  padding: '18px 0 26px 0',
};

const heroTitleStyle: React.CSSProperties = {
  margin: 0,
  color: '#fff',
  fontSize: 'clamp(32px, 4vw, 56px)',
  fontWeight: '900',
  lineHeight: '1.02',
  maxWidth: '760px',
};

const heroTextStyle: React.CSSProperties = {
  margin: '18px 0 0 0',
  color: '#a9b6b1',
  fontSize: '16px',
  lineHeight: '1.7',
  maxWidth: '760px',
};

const documentSurfaceStyle: React.CSSProperties = {
  background: 'rgba(9, 13, 12, 0.76)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '28px',
  backdropFilter: 'blur(14px)',
  overflow: 'hidden',
};

const docSectionStyle: React.CSSProperties = {
  padding: '40px 42px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  scrollMarginTop: '24px',
};

const sectionHeaderStyle: React.CSSProperties = {
  marginBottom: '24px',
};

const sectionMetaStyle: React.CSSProperties = {
  margin: '0 0 12px 0',
  color: '#6f817b',
  fontSize: '12px',
  fontWeight: '800',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const sectionBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const contentBlockStyle: React.CSSProperties = {
  maxWidth: '880px',
};

const contentTitle: React.CSSProperties = {
  margin: 0,
  color: '#fff',
  fontSize: 'clamp(24px, 2vw, 34px)',
  fontWeight: '900',
  lineHeight: '1.3',
};

const subTitle: React.CSSProperties = {
  color: '#0abab5',
  fontSize: '17px',
  fontWeight: '900',
  margin: '0 0 12px 0',
};

const textBlock: React.CSSProperties = {
  color: '#d8dfdb',
  fontSize: '15px',
  lineHeight: '1.75',
  margin: 0,
};

const listStyle: React.CSSProperties = {
  color: '#d8dfdb',
  fontSize: '15px',
  lineHeight: '1.8',
  paddingLeft: '20px',
  margin: '12px 0 0 0',
};
