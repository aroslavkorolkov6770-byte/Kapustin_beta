"use client";
import React, { useState, useEffect, useMemo } from 'react';
import CustomIcon from '@/app/components/CustomIcon';
import { isClientAdminView } from '@/app/lib/authClient';
import { saveDataToServer } from '@/app/lib/storageClient';

// --- ПОЛНАЯ БАЗА АССОРТИМЕНТА (ТОВАРНАЯ МАТРИЦА) ---
export const INITIAL_ASSORTMENT = [
  {
    id: "as_1", title: "1. ЧАЙ (Camellia sinensis)", desc: "Настоящий чай — только из листьев чайного куста (Camellia sinensis). Критерий: если в смеси более ⅔ чайного листа — это чай; если меньше — чаеподобный напиток.",
    children: [
      {
        id: "as_1_1", title: "1.1 Весовой чай", desc: "Чай на развес без фабричной упаковки. Покупатель выбирает сорт и количество; минимальный отпуск — 50 г.",
        children: [
          {
            id: "as_1_1_1", title: "Классический (без добавок)", desc: "Чистый чай без каких-либо добавок, ароматизаторов или вкусовых компонентов. Вкус определяется только сортом, регионом и степенью ферментации.",
            children: [
              {
                id: "as_1_1_1_ch", title: "Китай (по степени ферментации)", desc: "Чаи китайского производства, упорядоченные от минимальной ферментации (белый) до максимальной (пуэр шу). Каждый тип имеет уникальный вкусовой профиль.",
                children: [
                  { id: "as_c1", title: "Белый чай", content: "Минимально обработанный; нежный, травянистый вкус, низкое содержание кофеина." },
                  { id: "as_c2", title: "Жёлтый чай", content: "Редкий сорт с мягкой томлением листа; мягче зелёного, без горечи." },
                  { id: "as_c3", title: "Зелёный чай", content: "Неферментированный, фиксированный нагревом; свежий, растительный, с умеренным кофеином." },
                  { id: "as_c4", title: "Зелёный жасминовый", content: "Зелёный чай, ароматизированный цветами жасмина; цветочный, освежающий." },
                  { id: "as_c5", title: "Улун", content: "Частично ферментированный; вкусовой спектр — от зелёного до красного в зависимости от степени выдержки." },
                  { id: "as_c6", title: "Красный чай", content: "Полностью ферментированный (в Европе — черный); насыщенный, с нотами солода, сухофруктов или шоколада." },
                  { id: "as_c7", title: "Пуэр шу (тёмный)", content: "Ускоренно ферментированный (технология Во Дуй); густой, землистый, древесный профиль." },
                  { id: "as_c8", title: "Пуэр шэн (зелёный)", content: "Чай естественного старения; в молодости терпкий и свежий, с годами становится мягче и глубже." },
                  { id: "as_c9", title: "Связанный чай", content: "Чайные листья (чаще зелёные), связанные вручную вокруг сухого цветка; раскрывается при заваривании." }
                ]
              },
              {
                id: "as_1_1_1_in", title: "Индия", desc: "Чёрный (красный) чай из Индии. Отличается крепостью и терпкостью.",
                children: [
                  { id: "as_i1", title: "Дарджилинг", content: "Выращивается в Гималаях; утончённый, мускатный вкус, часто называют «чайным шампанским»." },
                  { id: "as_i2", title: "Ассам", content: "Выращивается в низинах; крепкий, солодовый вкус, идеален для утреннего чаепития." },
                  { id: "as_i3", title: "Прочие регионы", content: "Нилгири и другие индийские сорта." }
                ]
              },
              { id: "as_c_cey", title: "Цейлон (Шри-Ланка)", desc: "Островной чёрный чай. Обладает ярким медно-красным настоем и классической терпкостью, хорошо сочетается с лимоном.", content: "Островной чёрный чай. Обладает ярким медно-красным настоем и классической терпкостью, хорошо сочетается с лимоном." },
              { id: "as_c_oth", title: "Прочие страны", desc: "Японский чай (матча, сенча с характерным морским/водорослевым профилем), чаи из Вьетнама, Кении, Грузии, Краснодарского края.", content: "Японский чай (матча, сенча с характерным морским/водорослевым профилем), чаи из Вьетнама, Кении, Грузии, Краснодарского края." }
            ]
          },
          {
            id: "as_1_1_2", title: "С добавками", desc: "Чай с добавлением ароматизаторов или натуральных компонентов для создания новых вкусовых профилей.",
            children: [
              {
                id: "as_add_1", title: "С ароматизаторами", desc: "Содержат пищевые ароматизаторы, часто дополнены кусочками фруктов или лепестками.",
                children: [
                  { id: "as_a1", title: "На основе чёрного чая", content: "Чёрный чай с ароматизаторами (ягоды, шоколад, цитрус)." },
                  { id: "as_a2", title: "На основе зелёного чая", content: "Зелёный чай с фруктовыми или цветочными ароматизаторами." },
                  { id: "as_a3", title: "На основе улуна", content: "Улуны с ароматизаторами (например, молочный улун с добавками)." },
                  { id: "as_a4", title: "На основе пуэра", content: "Шу пуэры с добавлением вишни, земляники или шоколадных нот." },
                  { id: "as_a5", title: "На основе купажей", content: "Смеси чёрного и зелёного чая с ароматизаторами (например, «1001 ночь»)." }
                ]
              },
              { id: "as_add_2", title: "С натуральными добавками (без ароматизаторов)", desc: "Чай, смешанный только с натуральными сухими ягодами, фруктами, травами или специями, без использования химических ароматизаторов.", content: "Чай, смешанный только с натуральными сухими ягодами, фруктами, травами или специями, без использования химических ароматизаторов." }
            ]
          }
        ]
      },
      {
        id: "as_1_2", title: "1.2 Прессованный чай", desc: "Чай, спрессованный в формы (блин, точа, кирпич) для удобства транспортировки и длительного хранения. В таком виде он продолжает медленно ферментироваться.",
        children: [
          { id: "as_p_1", title: "Белый прессованный", content: "Чаще всего прессуют сорта Бай Му Дань или Шоу Мэй. Со временем вкус становится медовым и более плотным." },
          { id: "as_p_2", title: "Зелёный прессованный", content: "Прессованный зелёный чай; встречается редко, сохраняет свежесть при правильном хранении." },
          { id: "as_p_3", title: "Улун прессованный", content: "Обычно это старые выдержанные улуны (Лао Ча), спрессованные для дальнейшей ферментации." },
          { id: "as_p_4", title: "Красный прессованный", content: "Красный чай в форме блина или кирпича; вкус становится более округлым." },
          { id: "as_p_5", title: "Пуэр шу (прессованный)", content: "Самая популярная форма тёмного пуэра. Отличается плотностью и мягкостью выдержанного вкуса." },
          { id: "as_p_6", title: "Пуэр шэн (зелёный прессованный)", content: "Сырой пуэр в блинах; форма прессовки идеально подходит для его многолетнего созревания." }
        ]
      },
      {
        id: "as_1_3", title: "1.3 Фасованный чай", desc: "Чай, упакованный на фабрике производителя в фирменную тару. Не продаётся на развес.",
        children: [
          {
            id: "as_1_3_1", title: "По брендам (Бренд 1, Бренд 2 и т.д.)", desc: "Группировка фасованного чая по конкретным торговым маркам.",
            children: [
              { id: "as_f_1", title: "Подарочная упаковка", content: "Чай в жестяных банках, тубах, шкатулках или наборах с красивым оформлением." },
              { id: "as_f_2", title: "Заварной (листовой фасованный)", content: "Классический листовой чай в фабричных картонных пачках или фольге." },
              { id: "as_f_3", title: "Порционный (пакетированный)", content: "Чай в саше, пакетиках или пирамидках для быстрого разового заваривания." }
            ]
          }
        ]
      }
    ]
  },
  {
    id: "as_2", title: "2. КОФЕ", desc: "Ассортимент кофейных зёрен и продуктов на их основе.",
    children: [
      {
        id: "as_2_1", title: "2.1 Весовой кофе (классификация по обжарщику/производителю)", desc: "Кофе в зёрнах, продающийся на развес. Обжарка только средняя, чтобы подчеркнуть вкус, а не скрыть дефекты.",
        children: [
          {
            id: "as_2_1_1", title: "По обжарщикам", desc: "Группировка кофе по компаниям, производящим обжарку.",
            children: [
              {
                id: "as_2_1_1_1", title: "Плантационный", desc: "Классический зерновой кофе без ароматизаторов, с естественным вкусовым профилем.",
                children: [
                  { id: "as_k_1", title: "Моносорта", content: "100% арабика из одного конкретного региона (например, Эфиопия, Колумбия); обладает уникальным местным вкусом (терруаром)." },
                  { id: "as_k_2", title: "Эспрессо-смеси", content: "Смеси (часто арабика + робуста), специально подобранные для получения плотного эспрессо с хорошей пенкой (кремой)." },
                  { id: "as_k_3", title: "Купажи", content: "Авторские смеси арабики из разных стран для достижения сбалансированного, сложного вкуса." }
                ]
              },
              {
                id: "as_2_1_1_2", title: "Ароматизированный", desc: "Кофейные зёрна, пропитанные пищевыми ароматизаторами после обжарки.",
                children: [
                  { id: "as_k_4", title: "Моносорта", content: "Ароматизатор наносится на базу из одного сорта (например, Ирландский крем на бразильской арабике)." },
                  { id: "as_k_5", title: "Купажи", content: "Ароматизированные смеси различных сортов кофе." }
                ]
              }
            ]
          }
        ]
      },
      {
        id: "as_2_2", title: "2.2 Фасованный кофе", desc: "Кофе в фабричной закрытой упаковке.",
        children: [
          {
            id: "as_2_2_1", title: "По брендам (Бренд 1, Бренд 2 и т.д.)", desc: "Фасованный кофе, сгруппированный по торговым маркам.",
            children: [
              { id: "as_f_k_1", title: "Подарочная упаковка", content: "Фасованный кофе в красивых тубах или подарочных наборах." },
              {
                id: "as_f_k_2", title: "Зерновой", desc: "Цельные зёрна кофе в фабричных пачках.",
                children: [
                  { id: "fk_1", title: "Моносорта", content: "Заводская фасовка плантационной арабики одного сорта." },
                  { id: "fk_2", title: "Эспрессо-смеси", content: "Заводские бленды для эспрессо." },
                  { id: "fk_3", title: "Купажи", content: "Готовые фабричные смеси зернового кофе." },
                  { id: "fk_4", title: "Ароматизированный", content: "Заводской ароматизированный кофе в зёрнах." }
                ]
              },
              {
                id: "as_f_k_3", title: "Молотый", desc: "Фабрично смолотый кофе, готовый к завариванию в турке, чашке или кофеварке.",
                children: [
                  { id: "fm_1", title: "Моносорта", content: "Молотый кофе одного сорта." },
                  { id: "fm_2", title: "Эспрессо-смеси", content: "Молотые смеси для приготовления эспрессо." },
                  { id: "fm_3", title: "Купажи", content: "Готовые купажи молотого кофе." },
                  { id: "fm_4", title: "Ароматизированный", content: "Ароматизированный молотый кофе." }
                ]
              },
              {
                id: "as_f_k_4", title: "Растворимый", desc: "Кофе, прошедший технологическую обработку для мгновенного растворения в воде.",
                children: [
                  { id: "fr_1", title: "Порошок (спрей-драйд)", content: "Мелкий порошок, полученный распылительной сушкой. Самый дешёвый вид растворимого кофе." },
                  { id: "fr_2", title: "Гранула (агломерированный)", content: "Порошок, сбитый паром в гранулы." },
                  { id: "fr_3", title: "Кристалл (сублимированный / фриз-драйд)", content: "Кофе, замороженный и высушенный в вакууме. Наиболее полно сохраняет вкус и аромат." }
                ]
              },
              {
                id: "as_f_k_5", title: "Порционный", desc: "Фасовка, рассчитанная строго на одну порцию напитка.",
                children: [
                  { id: "fp_1", title: "Чалды (дрип-пакеты)", content: "Бумажные фильтры с молотым кофе для заваривания проливом прямо в чашке." },
                  { id: "fp_2", title: "Капсулы", content: "Пластиковые или алюминиевые капсулы для кофемашин систем Nespresso, Dolce Gusto и др." },
                  { id: "fp_3", title: "Пакетики", content: "Обычный растворимый или молотый кофе в одноразовых саше." },
                  { id: "fp_4", title: "3 в 1", content: "Смесь растворимого кофе, сахара и сухих сливок в одном пакетике." }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: "as_3", title: "3. ЧАЕПОДОБНЫЕ НАПИТКИ", desc: "Высушенные растения, не являющиеся Camellia sinensis (менее ⅔ чая в составе).",
    children: [
      {
        id: "as_3_1", title: "3.1 Весовые чаеподобные напитки", desc: "Травяные и фруктовые сборы, продающиеся на развес.",
        children: [
          {
            id: "as_3_1_1", title: "Этнические", desc: "Традиционные напитки разных народов мира, имеющие свою культуру потребления.",
            children: [
              { id: "et_1", title: "Иван-чай", content: "Традиционный русский напиток из листьев кипрея. Не содержит кофеина, обладает медово-цветочным вкусом." },
              { id: "et_2", title: "Матэ", content: "Латиноамериканский тонизирующий напиток из листьев падуба парагвайского. Пьётся из калебаса через бомбилью." },
              { id: "et_3", title: "Ройбуш (ройбос)", content: "Африканский напиток из кустарника. Сладковатый древесный вкус, богат антиоксидантами, без кофеина." },
              { id: "et_4", title: "Прочие", content: "Кудин (горькая китайская трава), лапачо (из коры муравьиного дерева), ханибуш (медовый куст)." }
            ]
          },
          {
            id: "as_3_1_2", title: "Травяные", desc: "Сборы из полезных и ароматных трав.",
            children: [
              { id: "tr_1", title: "Натуральные", content: "Моно-травы без добавок: марокканская мята, чабрец, ромашка, лемонграсс." },
              { id: "tr_2", title: "Ароматизированные", content: "Травяные сборы с добавлением ароматизаторов для усиления запаха (например, купажи для SPA)." }
            ]
          },
          { id: "as_3_1_3", title: "Фруктовые", desc: "Смеси на основе гибискуса (каркадэ) с добавлением сушёных ягод, яблок, цукатов и шиповника (например, «Наглый фрукт»). Дают кисло-сладкий красный настой.", content: "Смеси на основе гибискуса (каркадэ) с добавлением сушёных ягод, яблок, цукатов и шиповника (например, «Наглый фрукт»). Дают кисло-сладкий красный настой." },
          {
            id: "as_3_1_4", title: "Растительные добавки к чаю", desc: "Чистые цветы и травы, которые покупатели добавляют в чай для изменения вкуса.",
            children: [
              { id: "rd_1", title: "Цветы хризантемы", content: "Дают освежающий цветочный вкус, традиционно завариваются вместе с пуэрами." },
              { id: "rd_2", title: "Бутоны роз", content: "Придают мягкую сладость и нежный аромат; часто добавляются в красные чаи и улуны." },
              { id: "rd_3", title: "Лепестки василька", content: "Используются в основном для эстетического украшения чайных смесей." },
              { id: "rd_4", title: "Цветы жасмина", content: "Натуральный ароматизатор; добавляют свежую, яркую цветочную ноту зелёному чаю." }
            ]
          },
          { id: "as_3_1_5", title: "Какао и цикорий", desc: "Натуральный какао-порошок для варки и напитки на основе жареного корня цикория (заменитель кофе без кофеина).", content: "Натуральный какао-порошок для варки и напитки на основе жареного корня цикория (заменитель кофе без кофеина)." }
        ]
      },
      { id: "as_3_2", title: "3.2 Фасованные чаеподобные напитки", desc: "Травяные, фруктовые сборы и этнические напитки в фабричной упаковке (пачки или пакетики).", content: "Травяные, фруктовые сборы и этнические напитки в фабричной упаковке (пачки или пакетики)." }
    ]
  },
  {
    id: "as_4", title: "4. СЛАДОСТИ И ДЕСЕРТЫ К ЧАЮ И КОФЕ", desc: "Готовые к употреблению съедобные продукты, не требующие особых температурных условий хранения. Предназначены для допродажи к основному ассортименту.",
    children: [
      {
        id: "as_4_1", title: "4.1 Длительного хранения (≥8 месяцев)", desc: "Продукты с большим сроком годности.",
        children: [
          {
            id: "as_4_1_1", title: "Сахар", desc: "Специализированный сахар для напитков.",
            children: [
              { id: "sh_1", title: "Тростниковый", content: "Коричневый нерафинированный сахар, обладающий лёгким карамельным вкусом." },
              { id: "sh_2", title: "Карамельный (леденцовый)", content: "Крупные прозрачные или коричневые кристаллы, часто продаются на деревянных палочках для размешивания." }
            ]
          },
          { id: "as_4_1_2", title: "Мёд", desc: "Натуральный пчелиный мёд различных сортов (липовый, гречишный, разнотравье) в стеклянной таре.", content: "Натуральный пчелиный мёд различных сортов (липовый, гречишный, разнотравье) в стеклянной таре." },
          { id: "as_4_1_3", title: "Сиропы", desc: "Сладкие густые добавки для кофе и кофейных коктейлей (карамель, ваниль, лесной орех и т.д.).", content: "Сладкие густые добавки для кофе и кофейных коктейлей (карамель, ваниль, лесной орех и т.д.)." },
          { id: "as_4_1_4", title: "Варенье, конфитюр, джемы", desc: "Ягодные и фруктовые десерты в банках, отлично дополняющие чаепитие.", content: "Ягодные и фруктовые десерты в банках, отлично дополняющие чаепитие." }
        ]
      },
      {
        id: "as_4_2", title: "4.2 Скоропортящиеся (<8 месяцев)", desc: "Кондитерские изделия со средним сроком хранения.",
        children: [
          { id: "sp_1", title: "Выпечка", content: "Фасованные имбирные пряники, печенье, бискотти." },
          { id: "sp_2", title: "Нуга", content: "Сладкая масса с добавлением орехов, цукатов или шоколада." },
          { id: "sp_3", title: "Шоколадные изделия", content: "Маленькие шоколадки для кофе с собой (10–25 г), шоколадные плитки, конфеты, драже." },
          { id: "sp_4", title: "Марципан", content: "Десерты из миндальной пасты, марципановые батончики и конфеты." }
        ]
      }
    ]
  },
  {
    id: "as_5", title: "5. ПОСУДА И АКСЕССУАРЫ", desc: "Инвентарь для заваривания, хранения и проведения чайных и кофейных церемоний.",
    children: [
      {
        id: "as_5_1", title: "5.1 Для чая (по материалам)", desc: "Чайная посуда, сгруппированная по материалу изготовления.",
        children: [
          { id: "as_5_1_1", title: "Посуда из глины", content: "Исинская глина. Пористый материал, который 'дышит' и впитывает эфирные масла. Идеален для пуэров и улунов; используется строго под один тип чая." },
          { id: "as_5_1_2", title: "Посуда из керамики", content: "Глазурованная глина. Не впитывает запахи, универсальна в использовании. Долго держит тепло." },
          { id: "as_5_1_3", title: "Посуда из фарфора", content: "Тонкий, звонкий материал. Идеален для зелёных, белых и жёлтых чаёв. Белизна фарфора позволяет оценить чистый цвет настоя." },
          { id: "as_5_1_4", title: "Посуда из стекла", content: "Жаропрочное стекло. Не удерживает тепло, но позволяет любоваться процессом заваривания, особенно связанного чая и светлых сортов." },
          { id: "as_5_1_5", title: "Посуда из чугуна", content: "Тяжёлая посуда, которая максимально долго сохраняет тепло. Внутри обычно покрыта эмалью от ржавчины." },
          { id: "as_5_1_6", title: "Посуда из нержавеющей стали", content: "Практичная, неубиваемая металлическая посуда; чаще используется для заведений общепита." },
          {
            id: "as_5_1_7", title: "Принадлежности для чайной церемонии", desc: "Специфический инвентарь для китайского чаепития (Пин Ча / Гунфу Ча).",
            children: [
              { id: "pr_1", title: "Ча Бань", content: "Чайная доска с поддоном для слива воды. Центр чайного пространства." },
              { id: "pr_2", title: "Ча Хэ", content: "Чайная коробочка, в которой гостям демонстрируют сухой лист для знакомства с ароматом перед завариванием." },
              { id: "pr_3", title: "Ча Цзюй", content: "Набор чайных инструментов (щипцы для пиал, игла для носика чайника, кисточка для ухода за посудой, лопатка для насыпания)." },
              { id: "pr_4", title: "Пин Мин Бэй и Вэн Сян Бэй", content: "Чайные пары с подставкой. Пин Мин Бэй (низкая широкая чаша) — для вкуса; Вэн Сян Бэй (высокая узкая) — для наслаждения ароматом." },
              { id: "pr_5", title: "Прочие", content: "Чайные полотенца (чабу), ситечки на подставке." }
            ]
          },
          {
            id: "as_5_1_8", title: "Аксессуары для чая", desc: "Вспомогательный инвентарь.",
            children: [
              { id: "ak_1", title: "Банки для хранения", content: "Жестяные, стеклянные с бугельным замком или керамические ёмкости для защиты чая от света и воздуха." },
              { id: "ak_2", title: "Ситечки", content: "Металлические, бамбуковые или тканевые фильтры для удержания чаинок при переливании настоя." },
              { id: "ak_3", title: "Ножи и шила для пуэра", content: "Острые инструменты для аккуратного расслаивания прессованного блина, чтобы не ломать лист." },
              { id: "ak_4", title: "Прочие", content: "Мерные ложки, термометры для воды." }
            ]
          }
        ]
      },
      {
        id: "as_5_2", title: "5.2 Для кофе", desc: "Инвентарь для помола, варки и подачи кофе.",
        children: [
          { id: "cf_1", title: "Мельницы", content: "Ручные кофемолки с жерновами для настройки правильного помола под конкретный способ заваривания." },
          { id: "cf_2", title: "Турки (джезвы)", content: "Сосуды с широким дном и узким горлышком для варки кофе по-восточному. Лучшие — медные с внутренним лужением." },
          { id: "cf_3", title: "Кофеварки гейзерные", content: "Мока-поты. Вода закипает в нижней части и под давлением пара проходит через кофе вверх. Даёт плотный, насыщенный напиток." },
          { id: "cf_4", title: "Френч-прессы", content: "Стеклянные колбы с поршнем-фильтром. Позволяют настаивать кофе (крупный помол) и отжимать гущу вниз." },
          {
            id: "cf_5", title: "Кофейные пары и чашки", desc: "Посуда под конкретный объём кофейного напитка.",
            children: [
              { id: "cp_1", title: "Эспрессо (50–70 мл)", content: "Маленькие чашки с толстыми стенками для сохранения температуры и плотной кофейной пенки (кремы)." },
              { id: "cp_2", title: "Чёрный кофе (80–100 мл)", content: "Средние чашки для классических порций лунго или двойного эспрессо." },
              { id: "cp_3", title: "Американо (>100 мл)", content: "Большие кружки для американо или напитков с молоком." }
            ]
          },
          { id: "cf_6", title: "Прочие", content: "Темперы (для трамбовки кофе в холдере), питчеры (молочники из стали для взбивания пены), весы бариста." }
        ]
      },
      {
        id: "as_5_3", title: "5.3 Для матэ", desc: "Традиционная южноамериканская посуда.",
        children: [
          { id: "mt_1", title: "Калебасы", content: "Сосуды из высушенной тыквы-горлянки (реже из дерева или керамики), в которых заваривается матэ." },
          { id: "mt_2", title: "Бомбильи", content: "Металлические трубочки с фильтром-ситечком на конце, через которые пьют настой со дна калебаса." },
          { id: "mt_3", title: "Термосы", content: "Специальные термосы со специальным узким носиком для направленного пролива воды в калебас без размывания «горки» матэ." }
        ]
      }
    ]
  },
  {
    id: "as_6", title: "6. ПОДАРОЧНАЯ УПАКОВКА", desc: "Упаковочные материалы, продающиеся за отдельную плату для оформления покупок.",
    children: [
      { id: "pu_1", title: "Пакеты и сумки", content: "Красивые бумажные, крафтовые или плотные полиэтиленовые пакеты с тематическим дизайном." },
      { id: "pu_2", title: "Коробки и корзины", content: "Подарочные картонные коробки, деревянные шкатулки, плетёные корзины для сборки наборов из нескольких позиций." },
      {
        id: "pu_3", title: "Упаковка для прессованного чая", desc: "Специальные форматы под размер прессованных блинов и кирпичей.",
        children: [
          { id: "pup_1", title: "Картонные и жестяные коробки", content: "Жёсткая упаковка для защиты блина от повреждений." },
          { id: "pup_2", title: "Пакеты/сумки для бин ча (блинов)", content: "Бумажные или тканевые чехлы под круглую форму блина (обычно 357 г)." },
          { id: "pup_3", title: "Пакеты/сумки для чжуан ча (кирпичей)", content: "Прямоугольные пакеты под форму кирпича." }
        ]
      }
    ]
  },
  {
    id: "as_7", title: "7. СОПУТСТВУЮЩИЕ ТОВАРЫ", desc: "Продукция, дополняющая ассортимент без нарушения концепции магазина. Расширяет средний чек.",
    children: [
      { id: "st_1", title: "Сувениры фэн-шуй", content: "Декоративные фигурки: жабы, драконы, черепахи, хотеи, писающие мальчики. Фигурки, меняющие цвет от кипятка — популярный чайный подарок." },
      { id: "st_2", title: "Книги на чайную тематику", content: "Литература для углубления в чайную культуру: Похлёбкин, Вингородский, «Чайный канон» Лю Юя." },
      { id: "st_3", title: "Аромамасла и аксессуары", content: "Аромалампы и эфирные масла. Создают атмосферу в доме, органично дополняют покупку чая." },
      { id: "st_4", title: "Го (вейчи, бадук)", content: "Классическая китайская настольная игра (камни на доске), тесно связанная с чайной традицией." }
    ]
  }
];

// --- КОМПОНЕНТ РЕКУРСИВНОГО УЗЛА ---
function AssortmentNode({ 
    node, 
    depth = 0, 
    targetId, 
    isAdmin, 
    onAdd, 
    onEdit, 
    onDelete, 
    onMove 
}: { 
    node: any, 
    depth?: number, 
    targetId?: string | null,
    isAdmin: boolean,
    onAdd: (id: string) => void,
    onEdit: (node: any) => void,
    onDelete: (id: string) => void,
    onMove: (id: string, direction: 'up' | 'down') => void
}) {
    const hasTargetInChildren = (n: any, t: string): boolean => {
        if (n.id === t) return true;
        if (n.children) return n.children.some((c: any) => hasTargetInChildren(c, t));
        return false;
    };

    const shouldBeOpen = targetId ? hasTargetInChildren(node, targetId) : false;
    const [isOpen, setIsOpen] = useState(shouldBeOpen);
    const isTarget = targetId === node.id;
    const hasChildren = node.children && node.children.length > 0;

    // Тот самый фикс! Теперь мы берем текст из desc или из content, поэтому описание не пропадает
    const descText = node.desc || node.content;

    useEffect(() => {
        if (targetId && hasTargetInChildren(node, targetId)) {
            setIsOpen(true);
        }
    }, [targetId, node]);

    return (
        <div className="assortment-node" data-depth={depth} style={{ marginLeft: depth === 0 ? '0' : '20px', borderLeft: depth === 0 ? 'none' : '1px solid #333', paddingLeft: depth === 0 ? '0' : '15px', marginTop: depth === 0 ? '12px' : '8px', marginBottom: depth === 0 ? '12px' : '8px' }}>
            <div
                className={`assortment-row hover-card-unified-app${isOpen ? ' is-open' : ''}${isTarget ? ' is-target' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: isOpen ? '#1a1a1a' : '#111', borderRadius: '10px', 
                    border: isTarget ? '1px solid #0abab5' : '1px solid #222',
                    boxShadow: isTarget ? '0 0 15px rgba(10,186,181,0.2)' : 'none',
                    transition: 'all 0.15s ease',
                    cursor: 'pointer',
                    userSelect: 'none',
                }}
            >
                <div className="assortment-row-main" style={{ display: 'flex', alignItems: 'center', flex: 1, color: '#fff', minWidth: 0, paddingRight: '10px' }}>
                    <span className={`assortment-row-toggle${hasChildren ? ' has-children' : ''}`} style={{ marginRight: '12px', color: '#0abab5', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.15s', fontSize: '12px', flexShrink: 0 }}>
                        {hasChildren ? (
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M5 3.5L9 7L5 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        ) : (
                            <span className="assortment-row-dot" />
                        )}
                    </span>
                    {/* Фикс переноса текста заголовка */}
                    <span className="assortment-row-title" style={{ fontWeight: depth === 0 ? 'bold' : 'normal', fontSize: depth === 0 ? '18px' : '16px', wordBreak: 'break-word', lineHeight: '1.3' }}>{node.title}</span>
                </div>
                
                {/* ПАНЕЛЬ АДМИНА ДЛЯ КАЖДОЙ СТРОКИ */}
                {isAdmin && (
                    <div className="assortment-row-actions" style={{ display: 'flex', gap: '6px', marginLeft: 'auto', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button className="hover-unified-app" onClick={() => onMove(node.id, 'up')} title="Переместить выше" style={adminIconBtn as any}>
                            <MoveArrowIcon direction="up" />
                        </button>
                        <button className="hover-unified-app" onClick={() => onMove(node.id, 'down')} title="Переместить ниже" style={adminIconBtn as any}>
                            <MoveArrowIcon direction="down" />
                        </button>
                        <button className="hover-unified-app" onClick={() => onAdd(node.id)} title="Добавить подраздел" style={adminIconBtn as any}>
                            <PlusIcon />
                        </button>
                        <button className="hover-unified-app" onClick={() => onEdit(node)} title="Редактировать" style={adminIconBtn as any}>
                            <CustomIcon name="edit" size={15} color="#0abab5" />
                        </button>
                        <button className="hover-unified-app" onClick={() => onDelete(node.id)} title="Удалить" style={{...adminIconBtn, color: '#ff4d4d'} as any}><CustomIcon name="close" size={15} color="#ff4d4d" /></button>
                    </div>
                )}
            </div>
            
            {isOpen && (
                <div className="assortment-node-content" style={{ marginTop: '8px', animation: 'fadeInUp 0.2s ease' }}>
                    {/* Фикс переноса текста и отображения старых описаний */}
                    {descText && (
                        <div className="assortment-node-description" style={{ padding: '12px 18px', fontSize: '14px', color: '#aaa', background: '#0a0a0a', borderRadius: '8px', marginBottom: '8px', border: '1px solid #1a1a1a', wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                            {descText}
                        </div>
                    )}
                    {!descText && !hasChildren && (
                        <div className="assortment-node-description is-empty" style={{ padding: '12px 18px', fontSize: '13px', color: '#6f6f6f', background: '#0a0a0a', borderRadius: '8px', marginBottom: '8px', border: '1px dashed #1f1f1f', wordBreak: 'break-word', lineHeight: '1.5' }}>
                            {isAdmin ? 'Подраздел создан. Можно добавить описание или вложенный раздел.' : 'Подраздел пока не наполнен содержимым.'}
                        </div>
                    )}
                    {hasChildren && node.children.map((child: any) => (
                        <AssortmentNode key={child.id} node={child} depth={depth + 1} targetId={targetId} isAdmin={isAdmin} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} onMove={onMove} />
                    ))}
                </div>
            )}
        </div>
    );
}

function MoveArrowIcon({ direction }: { direction: 'up' | 'down' }) {
    const points = direction === 'up' ? '12 5 6 11 10 11 10 19 14 19 14 11 18 11 12 5' : '12 19 18 13 14 13 14 5 10 5 10 13 6 13 12 19';
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
            <polygon points={points} fill="#0abab5" />
        </svg>
    );
}

function PlusIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5V19M5 12H19" stroke="#0abab5" strokeWidth="3" strokeLinecap="round" />
        </svg>
    );
}

function countAssortmentNodes(nodes: any[]): number {
    return nodes.reduce((total, node) => total + 1 + countAssortmentNodes(Array.isArray(node.children) ? node.children : []), 0);
}

const getAssortmentTitleOrder = (title: string) => {
    const match = String(title || '').trim().match(/^(\d+(?:\.\d+)*)/u);
    return match ? match[1].split('.').map((part) => Number.parseInt(part, 10)) : null;
};

const compareAssortmentTitles = (leftTitle: string, rightTitle: string) => {
    const leftOrder = getAssortmentTitleOrder(leftTitle);
    const rightOrder = getAssortmentTitleOrder(rightTitle);

    if (leftOrder && rightOrder) {
        const maxLength = Math.max(leftOrder.length, rightOrder.length);
        for (let index = 0; index < maxLength; index += 1) {
            const leftPart = leftOrder[index] ?? -1;
            const rightPart = rightOrder[index] ?? -1;
            if (leftPart !== rightPart) return leftPart - rightPart;
        }
    } else if (leftOrder) {
        return -1;
    } else if (rightOrder) {
        return 1;
    }

    return String(leftTitle || '').localeCompare(String(rightTitle || ''), 'ru', { numeric: true });
};

const sortAssortmentTree = (nodes: any[]): any[] => {
    return [...nodes]
        .map((node) => ({
            ...node,
            ...(Array.isArray(node.children) ? { children: sortAssortmentTree(node.children) } : {}),
        }))
        .sort((left, right) => compareAssortmentTitles(left?.title, right?.title));
};

// --- ОСНОВНОЙ КОМПОНЕНТ ---
export default function Assortment({ assortmentMatrix, assortmentId }: { assortmentMatrix: any[], assortmentId: string | null }) {
    const [localMatrix, setLocalMatrix] = useState<any[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);

    // Модальные окна
    const [modalConfig, setModalConfig] = useState<{isOpen: boolean, mode: 'add' | 'edit', parentId: string | null, data: any}>({
        isOpen: false, mode: 'add', parentId: null, data: { id: '', title: '', desc: '' }
    });
    
    // Кастомное модальное окно для подтверждения удаления
    const [confirmDelete, setConfirmDelete] = useState<{isOpen: boolean, id: string | null}>({ isOpen: false, id: null });
    const totalAssortmentNodes = countAssortmentNodes(localMatrix);
    const orderedMatrix = useMemo(() => sortAssortmentTree(localMatrix), [localMatrix]);

    useEffect(() => {
        setIsAdmin(isClientAdminView());
        if (assortmentMatrix && assortmentMatrix.length > 0) {
            setLocalMatrix(assortmentMatrix);
        } else {
            setLocalMatrix(INITIAL_ASSORTMENT);
        }
    }, [assortmentMatrix]);

    useEffect(() => {
        const refreshAdminView = () => setIsAdmin(isClientAdminView());
        window.addEventListener('teaHubViewModeChanged', refreshAdminView);
        window.addEventListener('storage', refreshAdminView);

        return () => {
            window.removeEventListener('teaHubViewModeChanged', refreshAdminView);
            window.removeEventListener('storage', refreshAdminView);
        };
    }, []);

    // Функция сохранения на сервер
    const saveMatrix = (newMatrix: any[]) => {
        setLocalMatrix(newMatrix);
        localStorage.setItem('th_cache_assortment_matrix_v2', JSON.stringify(newMatrix));
        saveDataToServer('tea_hub_assortment_matrix_v2', newMatrix).catch((error) => {
            console.error('Ошибка сохранения ассортимента', error);
        });
    };

    // --- ФУНКЦИИ РЕДАКТИРОВАНИЯ ДЕРЕВА ---
    const handleAddNode = (parentId: string | null) => {
        setModalConfig({ isOpen: true, mode: 'add', parentId, data: { id: '', title: '', desc: '' } });
    };

    const handleEditNode = (node: any) => {
        // Забираем desc или content (для старых записей), чтобы объединить всё в одно поле
        const existingDesc = node.desc || node.content || '';
        setModalConfig({ isOpen: true, mode: 'edit', parentId: null, data: { id: node.id, title: node.title || '', desc: existingDesc } });
    };

    const handleDeleteNode = (id: string) => {
        // Открываем стильное окно
        setConfirmDelete({ isOpen: true, id });
    };

    const executeDeleteNode = () => {
        if (!confirmDelete.id) return;
        const id = confirmDelete.id;
        
        const deleteRecursive = (nodes: any[]): any[] => {
            return nodes.filter(n => n.id !== id).map(n => {
                if (n.children) return { ...n, children: deleteRecursive(n.children) };
                return n;
            });
        };
        
        saveMatrix(deleteRecursive(localMatrix));
        setConfirmDelete({ isOpen: false, id: null });
    };

    const handleMoveNode = (id: string, direction: 'up' | 'down') => {
        const moveRecursive = (nodes: any[]): any[] => {
            const index = nodes.findIndex(n => n.id === id);
            if (index !== -1) {
                const newNodes = [...nodes];
                if (direction === 'up' && index > 0) {
                    [newNodes[index - 1], newNodes[index]] = [newNodes[index], newNodes[index - 1]];
                } else if (direction === 'down' && index < newNodes.length - 1) {
                    [newNodes[index + 1], newNodes[index]] = [newNodes[index], newNodes[index + 1]];
                }
                return newNodes;
            }
            return nodes.map(n => {
                if (n.children) return { ...n, children: moveRecursive(n.children) };
                return n;
            });
        };
        saveMatrix(moveRecursive(localMatrix));
    };

    // --- СОХРАНЕНИЕ МОДАЛКИ ---
    const handleSaveModal = () => {
        if (!modalConfig.data.title.trim()) {
            alert("Название обязательно!");
            return;
        }

        const newNode = {
            id: modalConfig.mode === 'edit' ? modalConfig.data.id : 'as_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            title: modalConfig.data.title.trim(),
            desc: modalConfig.data.desc.trim(),
        };
        if (!newNode.desc) delete (newNode as any).desc;

        if (modalConfig.mode === 'add') {
            const addRecursive = (nodes: any[]): any[] => {
                if (!modalConfig.parentId) return [...nodes, newNode];
                return nodes.map(n => {
                    if (n.id === modalConfig.parentId) {
                        return { ...n, children: [...(n.children || []), newNode] };
                    }
                    if (n.children) return { ...n, children: addRecursive(n.children) };
                    return n;
                });
            };
            saveMatrix(addRecursive(localMatrix));
        } else {
            const editRecursive = (nodes: any[]): any[] => {
                return nodes.map(n => {
                    if (n.id === modalConfig.data.id) {
                        // Обновляем узел и удаляем старое свойство content, так как мы теперь используем только desc
                        const updatedNode = { ...n, ...newNode };
                        delete updatedNode.content;
                        return updatedNode;
                    }
                    if (n.children) return { ...n, children: editRecursive(n.children) };
                    return n;
                });
            };
            saveMatrix(editRecursive(localMatrix));
        }

        setModalConfig({ ...modalConfig, isOpen: false });
    };

    return (
        <section className="vates-assortment-screen" style={{ animation: 'fadeInUp 0.5s ease', maxWidth: '100%' }}>
            <div className="vates-page-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '15px' }}>
                <div>
                    <span className="vates-eyebrow">Структура каталога</span>
                    <h1>Ассортимент</h1>
                    <p>Иерархия товарных групп и описание каждого раздела.</p>
                </div>
                {isAdmin && (
                    <button className="hover-unified-app vates-button primary" onClick={() => handleAddNode(null)} style={adminActionBtn as any}>Добавить главный раздел</button>
                )}
            </div>
            <div className="vates-info-banner">
                <CustomIcon name="idea" size={22} color="currentColor" />
                <div><strong>Единая матрица ассортимента</strong><span>Разделы связаны с товарным каталогом. Импорт товаров продолжает дополнять дерево автоматически.</span></div>
            </div>

            <section className="vates-assortment-tree-shell">
                <header className="vates-assortment-tree-heading">
                    <div>
                        <span className="vates-eyebrow">Навигация по каталогу</span>
                        <h2>Дерево категорий</h2>
                    </div>
                    <div className="vates-assortment-stats" aria-label="Статистика структуры ассортимента">
                        <span><strong>{orderedMatrix.length}</strong> главных разделов</span>
                        <span><strong>{totalAssortmentNodes}</strong> категорий</span>
                    </div>
                </header>
                <div className="vates-assortment-tree">
                    {orderedMatrix.map((rootNode: any) => (
                        <AssortmentNode
                            key={rootNode.id}
                            node={rootNode}
                            depth={0}
                            targetId={assortmentId}
                            isAdmin={isAdmin}
                            onAdd={handleAddNode}
                            onEdit={handleEditNode}
                            onDelete={handleDeleteNode}
                            onMove={handleMoveNode}
                        />
                    ))}
                </div>
            </section>

            {/* МОДАЛЬНОЕ ОКНО РЕДАКТОРА */}
            {modalConfig.isOpen && (
                <div style={modalOverlay as any} onClick={() => setModalConfig({...modalConfig, isOpen: false})}>
                    <div style={modalContentSmall as any} onClick={e => e.stopPropagation()}>
                        <h2 style={{ color: '#0abab5', fontWeight: '900', marginBottom: '25px', textAlign: 'center', textTransform: 'uppercase' }}>
                            {modalConfig.mode === 'add' ? 'Новый раздел' : 'Редактировать'}
                        </h2>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <div style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', marginBottom: '5px', marginLeft: '5px' }}>Название (Обязательно)</div>
                                <input style={adminIn as any} placeholder="Например: 1.1 Зеленый чай" value={modalConfig.data.title} onChange={e => setModalConfig({...modalConfig, data: {...modalConfig.data, title: e.target.value}})} />
                            </div>
                            
                            {/* Одно большое поле описания без возможности растягивания */}
                            <div>
                                <div style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', marginBottom: '5px', marginLeft: '5px' }}>Описание раздела/товара</div>
                                <textarea style={{...adminIn, height: '200px', resize: 'none'} as any} placeholder="Опишите этот товар или категорию..." value={modalConfig.data.desc} onChange={e => setModalConfig({...modalConfig, data: {...modalConfig.data, desc: e.target.value}})} />
                            </div>
                        </div>

                        <button className="hover-unified-app" onClick={handleSaveModal} style={saveBtn as any}>СОХРАНИТЬ</button>
                        <div className="hover-link-unified-app" onClick={() => setModalConfig({...modalConfig, isOpen: false})} style={{ textAlign: 'center', marginTop: '20px', color: '#666', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>ОТМЕНА</div>
                    </div>
                </div>
            )}

            {/* СТИЛЬНОЕ ОКНО ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ */}
            {confirmDelete.isOpen && (
                <div style={modalOverlay as any} onClick={() => setConfirmDelete({isOpen: false, id: null})}>
                    <div style={{...modalContentSmall, textAlign: 'center'} as any} onClick={e => e.stopPropagation()}>
                        <div style={{ width: '60px', height: '60px', borderRadius: '18px', border: '1px solid rgba(255,77,77,0.35)', background: 'rgba(255,77,77,0.08)', color: '#ff4d4d', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}><CustomIcon name="alert" size={34} color="#ff4d4d" /></div>
                        <h2 style={{ color: '#ff4d4d', fontWeight: '900', marginBottom: '15px', textTransform: 'uppercase' }}>УДАЛИТЬ РАЗДЕЛ?</h2>
                        <p style={{ color: '#ccc', fontSize: '15px', lineHeight: '1.5', marginBottom: '25px' }}>
                            Вы уверены, что хотите удалить этот раздел и все его вложения? Это действие необратимо.
                        </p>
                        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                            <button className="hover-unified-app" onClick={() => setConfirmDelete({isOpen: false, id: null})} style={{ ...saveBtn, background: '#222', color: '#fff', flex: 1, minWidth: '100px', marginTop: 0 } as any}>ОТМЕНА</button>
                            <button className="hover-unified-app" onClick={executeDeleteNode} style={{ ...saveBtn, background: '#ff4d4d', color: '#fff', flex: 1, minWidth: '100px', marginTop: 0 } as any}>УДАЛИТЬ</button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                .assortment-row:hover { border-color: rgba(10, 186, 181, 0.45) !important; background: rgba(10, 186, 181, 0.08) !important; box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10,186,181,0.2) !important; }
                .assortment-row:active { transform: translateY(2px) scale(0.97) !important; }
                
                textarea::-webkit-scrollbar { width: 4px; }
                textarea::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
            `}</style>
        </section>
    );
}

// --- СТИЛИ АДМИНКИ ---
const adminIconBtn = {
    background: '#1a1a1a', 
    border: '1px solid #333', 
    borderRadius: '6px', 
    color: '#0abab5',
    width: '28px', 
    height: '28px', 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center',
    cursor: 'pointer', 
    fontSize: '12px', 
    transition: '0.2s',
    fontWeight: 'bold'
};

const adminActionBtn = { 
    background: 'rgba(10,186,181,0.1)', color: '#0abab5', border: '1px solid rgba(10,186,181,0.3)', 
    padding: '10px 20px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', 
    fontSize: '13px', letterSpacing: '1px', transition: '0.2s' 
};

const adminIn = { 
    width: '100%', padding: '16px', background: '#000', border: '1px solid #333', 
    borderRadius: '15px', color: '#fff', marginBottom: '0', outline: 'none', 
    fontSize: '15px', boxSizing: 'border-box' 
};

const saveBtn = { 
    width: '100%', padding: '18px', background: '#0abab5', color: '#000', 
    border: 'none', borderRadius: '15px', fontWeight: '900', cursor: 'pointer', 
    marginTop: '25px', fontSize: '15px', letterSpacing: '1px' 
};

const modalOverlay = { 
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
    background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', 
    justifyContent: 'center', zIndex: 30000, backdropFilter: 'blur(15px)', 
    padding: '20px', boxSizing: 'border-box' 
};

const modalContentSmall = { 
    background: '#111', padding: '40px 30px', borderRadius: '40px', 
    width: '100%', maxWidth: '450px', border: '1px solid #333', 
    boxSizing: 'border-box', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)' 
};
