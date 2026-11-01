"use client";
import React, { useState, useEffect, Suspense } from 'react';
import Navigation from '@/app/components/Navigation';
import CustomIcon from '@/app/components/CustomIcon';
import { isClientAdminView } from '@/app/lib/authClient';

// --- ХЕЛПЕР ДЛЯ ЗАПИСИ ДАННЫХ НА СЕРВЕР ---
const saveDataToServer = (key: string, data: any) => {
    fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, data })
    }).catch(err => console.error("Ошибка сохранения на сервер:", err));
};

interface Tea {
  id: number | string; name: string; type: string; category: string; strength: string;
  info: string; summary: string; desc: string;
  img: string; isDayTea: boolean;
  region?: string; brewGuide?: string; advice?: string; analogsDiff?: string;
  quiz?: { q: string; o: string[]; c: number }[];
}

const STRENGTHS_BACKUP = ["Мягкий", "Средний", "Крепкий"];

// --- МАКСИМАЛЬНО ПОЛНАЯ БАЗА (30 ПОЗИЦИЙ) ---
const INITIAL_DATABASE: Tea[] = [
  // ЧАЙ (15 позиций)
  { 
    id: 1, name: "Лунцзин", type: "Чай", category: "Зеленый", strength: "Мягкий", info: "75°C", summary: "Ореховый профиль, семечки.", desc: "Король зеленых чаев. Плоский лист, ручная обжарка в котлах.", img: "https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?q=80&w=800", isDayTea: false,
    region: "Ханчжоу, Сиху", brewGuide: "75°C, 2-3 мин", advice: "Для ценителей классики и мягкости.", analogsDiff: "Сладковатый ореховый финиш.",
    quiz: [{q: "Метод обработки?", o: ["Пар", "Обжарка в котле", "Сушка на солнце"], c: 1}]
  },
  { id: 2, name: "Би Ло Чунь", type: "Чай", category: "Зеленый", strength: "Средний", info: "80°C", summary: "Цветочный аромат.", desc: "Скрученные спирали с ворсом. Растет среди фруктовых садов.", img: "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?q=80&w=800", isDayTea: false, region: "Цзянсу", brewGuide: "80°C", advice: "Любителям ярких ароматов.", analogsDiff: "Более цветочный, чем Лунцзин.", quiz: [{q: "Где растет?", o: ["В лесу", "Среди фруктовых садов"], c: 1}] },
  { id: 3, name: "Тайпин Хоукуй", type: "Чай", category: "Зеленый", strength: "Крепкий", info: "85°C", summary: "Травянистый, мощный.", desc: "Огромные плоские листья. Уникальный внешний вид.", img: "https://images.unsplash.com/photo-1563911302283-d2bc129e7570?q=80&w=800", isDayTea: false, region: "Аньхой", brewGuide: "85°C", advice: "Для тех, кто ищет эффектную подачу.", analogsDiff: "Самый крупный лист.", quiz: [{q: "Размер листа?", o: ["Мелкий", "Средний", "Очень крупный"], c: 2}] },
  { id: 4, name: "Бай Хао Инь Чжэнь", type: "Чай", category: "Белый", strength: "Мягкий", info: "70°C", summary: "Медовые ноты, хвоя.", desc: "Только верхушечные почки. Самый нежный белый чай.", img: "https://images.unsplash.com/photo-1576092762791-dd9e2220abd1?q=80&w=800", isDayTea: false, region: "Фуцзянь", brewGuide: "70°C", advice: "Для утреннего чаепития.", analogsDiff: "Высший сорт белого чая.", quiz: [{q: "Что в составе?", o: ["Листья", "Почки"], c: 1}] },
  { id: 5, name: "Бай Му Дань", type: "Чай", category: "Белый", strength: "Средний", info: "75°C", summary: "Полевые цветы.", desc: "Белый пион. Сочетание почки и двух верхних листьев.", img: "https://images.unsplash.com/photo-1544787210-2213d2427517?q=80&w=800", isDayTea: false, region: "Фудин", brewGuide: "75°C", advice: "Баланс нежности и вкуса.", analogsDiff: "Насыщеннее Инь Чжэня.", quiz: [{q: "Как переводится?", o: ["Белый лотос", "Белый пион"], c: 1}] },
  { id: 6, name: "Те Гуань Инь", type: "Чай", category: "Улун", strength: "Мягкий", info: "85°C", summary: "Орхидея и сирень.", desc: "Классический светлый улун. Плотные изумрудные гранулы.", img: "https://images.unsplash.com/photo-1594631252845-29fc4586d517?q=80&w=800", isDayTea: true, region: "Аньси", brewGuide: "85°C", advice: "Для релаксации.", analogsDiff: "Сливочный, цветочный профиль.", quiz: [{q: "Степень ферментации?", o: ["Светлый", "Темный"], c: 0}] },
  { id: 7, name: "Да Хун Пао", type: "Чай", category: "Улун", strength: "Крепкий", info: "95°C", summary: "Огонь, дым, карамель.", desc: "Утесный темный улун сильной прожарки.", img: "https://images.unsplash.com/photo-1563911302283-d2bc129e7570?q=80&w=800", isDayTea: false, region: "Уишань", brewGuide: "95°C", advice: "Для вечерних бесед.", analogsDiff: "Мощная прожарка.", quiz: [{q: "Где растет?", o: ["В горах", "На равнине"], c: 0}] },
  { id: 8, name: "Габа Алишань", type: "Чай", category: "Улун", strength: "Средний", info: "90°C", summary: "Печеные яблоки, кислинка.", desc: "Чай, прошедший ферментацию без доступа кислорода.", img: "https://images.unsplash.com/photo-1544787210-2213d2427517?q=80&w=800", isDayTea: false, region: "Тайвань", brewGuide: "90°C", advice: "Для концентрации внимания.", analogsDiff: "Содержит ГАМК.", quiz: [{q: "Главная особенность?", o: ["Цвет", "ГАМК (GABA)"], c: 1}] },
  { id: 9, name: "Дянь Хун", type: "Чай", category: "Красный", strength: "Средний", info: "95°C", summary: "Мед и сухофрукты.", desc: "Юньнаньский красный чай с обилием золотистых почек.", img: "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?q=80&w=800", isDayTea: false, region: "Юньнань", brewGuide: "95°C", advice: "Классический согревающий чай.", analogsDiff: "Более сладкий, чем Сяо Чжун.", quiz: [{q: "Цвет почек?", o: ["Черные", "Золотистые"], c: 1}] },
  { id: 10, name: "Лапсанг Сушонг", type: "Чай", category: "Красный", strength: "Крепкий", info: "95°C", summary: "Дым, чернослив, костер.", desc: "Копченый на сосновых дровах красный чай.", img: "https://images.unsplash.com/photo-1563911302283-d2bc129e7570?q=80&w=800", isDayTea: false, region: "Фуцзянь", brewGuide: "95°C", advice: "Для любителей необычных вкусов.", analogsDiff: "Характерный дегтярный аромат.", quiz: [{q: "Чем пахнет?", o: ["Цветами", "Дымом/Костром"], c: 1}] },
  { id: 11, name: "Шу Пуэр", type: "Чай", category: "Пуэр", strength: "Крепкий", info: "100°C", summary: "Землистый, орехи, кора.", desc: "Чай ускоренной ферментации. Плотный, темный настой.", img: "https://images.unsplash.com/photo-1582793988951-9aed5509eb97?q=80&w=800", isDayTea: false, region: "Юньнань", brewGuide: "100°C", advice: "Для бодрости.", analogsDiff: "Не дает горечи при перестое.", quiz: [{q: "Цвет настоя?", o: ["Прозрачный", "Черный/Нефтяной"], c: 1}] },
  { id: 12, name: "Шен Пуэр", type: "Чай", category: "Пуэр", strength: "Средний", info: "90°C", summary: "Курага, дымок, свежесть.", desc: "Естественно состаренный пуэр. Профиль меняется со временем.", img: "https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?q=80&w=800", isDayTea: false, region: "Мэнхай", brewGuide: "90°C", advice: "Ценителям сложных переходов.", analogsDiff: "Фруктовая кислинка.", quiz: [{q: "Вкус со временем?", o: ["Портится", "Становится глубже"], c: 1}] },
  { id: 13, name: "Сяо Чжун", type: "Чай", category: "Красный", strength: "Средний", info: "95°C", summary: "Хлеб, ржаная корочка.", desc: "Красный чай без копчения. Глубокий хлебный вкус.", img: "https://images.unsplash.com/photo-1582793988951-9aed5509eb97?q=80&w=800", isDayTea: false, region: "Уишань", brewGuide: "95°C", advice: "Уютный вечерний чай.", analogsDiff: "Мягче Лапсанга.", quiz: [{q: "Нота?", o: ["Хлебная", "Морская"], c: 0}] },
  { id: 14, name: "Най Сян Улун", type: "Чай", category: "Улун", strength: "Мягкий", info: "85°C", summary: "Сливки, карамель.", desc: "Молочный улун. Ароматизированный сорт.", img: "https://images.unsplash.com/photo-1594631252845-29fc4586d517?q=80&w=800", isDayTea: false, region: "Фуцзянь", brewGuide: "85°C", advice: "Для начинающих путь в чай.", analogsDiff: "Яркий молочный аромат.", quiz: [{q: "Аромат?", o: ["Древесный", "Молочно-сливочный"], c: 1}] },
  { id: 15, name: "Габа Изумруд", type: "Чай", category: "Улун", strength: "Средний", info: "90°C", summary: "Ягоды, винная нота.", desc: "Светлая габа слабой прожарки. Травянисто-ягодный профиль.", img: "https://images.unsplash.com/photo-1544787210-2213d2427517?q=80&w=800", isDayTea: false, region: "Тайвань", brewGuide: "90°C", advice: "Для спокойного отдыха.", analogsDiff: "Кислее обычного улуна.", quiz: [{q: "Профиль?", o: ["Землистый", "Ягодно-кислый"], c: 1}] },

  // КОФЕ (15 позиций)
  { id: 101, name: "Эфиопия Иргачефф", type: "Кофе", category: "Арабика", strength: "Мягкий", info: "V60", summary: "Бергамот, жасмин, лимон.", desc: "Высокогорная арабика с чайным телом.", img: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?q=80&w=800", isDayTea: false, region: "Эфиопия", brewGuide: "93°C", advice: "Любителям легкого кофе.", analogsDiff: "Высокая кислотность.", quiz: [{q: "Нота?", o: ["Шоколад", "Цветы/Цитрус"], c: 1}] },
  { id: 102, name: "Бразилия Сантос", type: "Кофе", category: "Арабика", strength: "Средний", info: "Эспрессо", summary: "Орехи, молочный шоколад.", desc: "Классический сбалансированный вкус.", img: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=800", isDayTea: false, region: "Бразилия", brewGuide: "94°C", advice: "Идеально с молоком.", analogsDiff: "Низкая кислотность.", quiz: [{q: "Основная нота?", o: ["Орехово-шоколадная", "Ягодная"], c: 0}] },
  { id: 103, name: "Колумбия Супремо", type: "Кофе", category: "Арабика", strength: "Средний", info: "Фильтр", summary: "Карамель, красное яблоко.", desc: "Сорт с крупным зерном и чистым вкусом.", img: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=800", isDayTea: false, region: "Колумбия", brewGuide: "92°C", advice: "Универсальный выбор.", analogsDiff: "Сладкий профиль.", quiz: [{q: "Кислотность?", o: ["Яблочная", "Лимонная"], c: 0}] },
  { id: 104, name: "Кения АА", type: "Кофе", category: "Арабика", strength: "Крепкий", info: "V60", summary: "Смородина, вишня, томаты.", desc: "Самый яркий кофе с винной кислотностью.", img: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=800", isDayTea: false, region: "Кения", brewGuide: "94°C", advice: "Для кофейных гурманов.", analogsDiff: "Яркая ягодность.", quiz: [{q: "Главная нота?", o: ["Орех", "Черная смородина"], c: 1}] },
  { id: 105, name: "Суматра Манделин", type: "Кофе", category: "Азия", strength: "Крепкий", info: "Френч-пресс", summary: "Специи, табак, дерево.", desc: "Плотный, мужской кофе с низкой кислотностью.", img: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?q=80&w=800", isDayTea: false, region: "Индонезия", brewGuide: "95°C", advice: "Любителям горечи и плотности.", analogsDiff: "Очень землистый.", quiz: [{q: "Тело кофе?", o: ["Легкое", "Плотное/Тяжелое"], c: 1}] },
  { id: 106, name: "Коста-Рика Тарразу", type: "Кофе", category: "Арабика", strength: "Средний", info: "Фильтр", summary: "Абрикос, коричневый сахар.", desc: "Мягкий кофе с фруктовым послевкусием.", img: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=800", isDayTea: false, region: "Коста-Рика", brewGuide: "92°C", advice: "Сладкий утренний фильтр.", analogsDiff: "Сбалансирован.", quiz: [{q: "Нота?", o: ["Фруктовая", "Земляная"], c: 0}] },
  { id: 107, name: "Гватемала Антигуа", type: "Кофе", category: "Арабика", strength: "Средний", info: "Воронка", summary: "Дым, темный шоколад.", desc: "Вулканические почвы.", img: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=800", isDayTea: false, region: "Гватемала", brewGuide: "93°C", advice: "Для ценителей шоколада.", analogsDiff: "Дымное послевкусие.", quiz: [{q: "Почва?", o: ["Глина", "Вулканическая"], c: 1}] },
  { id: 108, name: "Вьетнам Робуста", type: "Кофе", category: "Робуста", strength: "Крепкий", info: "Фин", summary: "Табак, злаки, кофеин.", desc: "Горький кофе для бодрости.", img: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?q=80&w=800", isDayTea: false, region: "Вьетнам", brewGuide: "96°C", advice: "Сгущенка сгладит горечь.", analogsDiff: "Больше кофеина.", quiz: [{q: "Вид зерна?", o: ["Арабика", "Робуста"], c: 1}] },
  { id: 109, name: "Гондурас SHG", type: "Кофе", category: "Арабика", strength: "Средний", info: "Фильтр", summary: "Кедр, карамель.", desc: "Кофе высокогорного выращивания.", img: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=800", isDayTea: false, region: "Гондурас", brewGuide: "93°C", advice: "Повседневный выбор.", analogsDiff: "Древесные ноты.", quiz: [{q: "Маркировка SHG?", o: ["Низкогорный", "Высокогорный"], c: 1}] },
  { id: 110, name: "Сальвадор Пакамара", type: "Кофе", category: "Арабика", strength: "Мягкий", info: "V60", summary: "Тропики, сладость.", desc: "Сорт с очень крупными зернами.", img: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=800", isDayTea: false, region: "Сальвадор", brewGuide: "91°C", advice: "Для гурманов.", analogsDiff: "Крупное зерно.", quiz: [{q: "Размер зерна?", o: ["Крупный", "Мелкий"], c: 0}] },
  { id: 111, name: "Никарагуа Хинотега", type: "Кофе", category: "Арабика", strength: "Средний", info: "Турка", summary: "Какао, мед.", desc: "Плотный шоколадный профиль.", img: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?q=80&w=800", isDayTea: false, region: "Никарагуа", brewGuide: "94°C", advice: "Хорошо в турке.", analogsDiff: "Мягкая шоколадность.", quiz: [{q: "Нота?", o: ["Какао", "Бергамот"], c: 0}] },
  { id: 112, name: "Панама Гейша", type: "Кофе", category: "Премиум", strength: "Мягкий", info: "Калита", summary: "Бергамот, жасмин.", desc: "Элитный и дорогой кофе.", img: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=800", isDayTea: false, region: "Панама", brewGuide: "90°C", advice: "Особый случай.", analogsDiff: "Схож с чаем.", quiz: [{q: "Аромат?", o: ["Шоколадный", "Цветочный"], c: 1}] },
  { id: 113, name: "Руанда Бурбон", type: "Кофе", category: "Арабика", strength: "Мягкий", info: "Фильтр", summary: "Красная смородина.", desc: "Сладкий ягодный кофе.", img: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=800", isDayTea: false, region: "Руанда", brewGuide: "92°C", advice: "Любителям ягод.", analogsDiff: "Чистый вкус.", quiz: [{q: "Кислотность?", o: ["Высокая", "Низкая"], c: 0}] },
  { id: 114, name: "Бурунди Мытый", type: "Кофе", category: "Арабика", strength: "Средний", info: "Аэропресс", summary: "Грейпфрут, травы.", desc: "Терпкий цитрусовый вкус.", img: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?q=80&w=800", isDayTea: false, region: "Бурунди", brewGuide: "94°C", advice: "Бодрящий фильтр.", analogsDiff: "Травянистые ноты.", quiz: [{q: "Нота?", o: ["Цитрусовая", "Ореховая"], c: 0}] },
  { id: 115, name: "Танзания Пиберри", type: "Кофе", category: "Спешиалти", strength: "Средний", info: "V60", summary: "Вишня, лемонграсс.", desc: "Зерна круглой формы.", img: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=800", isDayTea: false, region: "Танзания", brewGuide: "93°C", advice: "Показать гостю форму зерна.", analogsDiff: "Зерно-горошина.", quiz: [{q: "Форма зерна?", o: ["Плоское", "Круглое (Пиберри)"], c: 1}] }
];

function ProductsContent() {
  const [isMounted, setIsMounted] = useState(false);
  const [products, setProducts] = useState<Tea[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // Динамические категории (управление админом)
  const [topCats, setTopCats] = useState<string[]>(["Чай", "Кофе"]);
  const [subsMap, setSubsMap] = useState<Record<string, string[]>>({
      "Чай": ["Зеленый", "Белый", "Улун", "Красный", "Пуэр"],
      "Кофе": ["Арабика", "Робуста", "Азия", "Премиум", "Спешиалти"]
  });
  const [strengthsMap, setStrengthsMap] = useState<Record<string, string[]>>({
      "Чай": ["Мягкий", "Средний", "Крепкий"],
      "Кофе": ["Мягкий", "Средний", "Крепкий"]
  });

  const [search, setSearch] = useState("");
  const [topCategory, setTopCategory] = useState("Все");
  const [activeCategory, setActiveCategory] = useState("Все");
  const [activeStrength, setActiveStrength] = useState("Все");

  const [selectedTea, setSelectedTea] = useState<Tea | null>(null);
  
  const [quizResults, setQuizResults] = useState<{[key: number]: number[]}>({});
  const [showQuiz, setShowQuiz] = useState(false);

  const [showForm, setShowForm] = useState(false);

  // Состояния для управления категориями
  const [confirmDelete, setConfirmDelete] = useState<{type: string, val: string} | null>(null);
  const [addItemModal, setAddItemModal] = useState<{type: string} | null>(null);
  const [newValue, setNewValue] = useState("");

  const [productToDelete, setProductToDelete] = useState<Tea | null>(null);

  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [formData, setFormData] = useState<Partial<Tea>>({
    name: '', type: 'Чай', category: 'Зеленый', strength: 'Мягкий', summary: '', desc: '', img: '', isDayTea: false, region: '', brewGuide: '', advice: '', analogsDiff: ''
  });

  // НОВАЯ СЕРВЕРНАЯ ЗАГРУЗКА
  const loadAllData = async () => {
      try {
          // Продукты
          let pData = await fetch('/api/storage?key=tea_master_unified_v1').then(r => r.json()).catch(() => []);
          if (!Array.isArray(pData) || pData.length === 0) {
              pData = INITIAL_DATABASE;
              saveDataToServer('tea_master_unified_v1', pData);
          }
          setProducts(pData);

          // Категории
          const tData = await fetch('/api/storage?key=sys_top_cats_v2').then(r => r.json()).catch(() => null);
          if (tData && Array.isArray(tData) && tData.length > 0) setTopCats(tData);

          const mData = await fetch('/api/storage?key=sys_subs_map_v2').then(r => r.json()).catch(() => null);
          if (mData && Object.keys(mData).length > 0) setSubsMap(mData);

          const sData = await fetch('/api/storage?key=sys_strengths_map_v2').then(r => r.json()).catch(() => null);
          if (sData && Object.keys(sData).length > 0) setStrengthsMap(sData);

      } catch (e) {
          console.error("Ошибка синхронизации с сервером", e);
      }
  };

  useEffect(() => {
    setIsAdmin(localStorage.getItem('isLoggedIn') === 'true' && isClientAdminView());
    
    // Первичная загрузка
    loadAllData();
    
    // Автообновление
    const syncInterval = setInterval(loadAllData, 5000);
    const focusHandler = () => loadAllData();
    window.addEventListener('focus', focusHandler);

    setIsMounted(true);

    return () => {
        clearInterval(syncInterval);
        window.removeEventListener('focus', focusHandler);
    };
  }, []);

  const saveProductsData = (list: Tea[]) => {
    setProducts(list);
    saveDataToServer('tea_master_unified_v1', list);
  };

  const syncSystem = (t: string[], m: any, s: any) => {
      saveDataToServer('sys_top_cats_v2', t);
      saveDataToServer('sys_subs_map_v2', m);
      saveDataToServer('sys_strengths_map_v2', s);
  };

  const handleAddItem = () => {
      if(!newValue.trim()) return;
      let newT = [...topCats];
      let newM = {...subsMap};
      let newS = {...strengthsMap};
      if(addItemModal?.type === 'top') { newT.push(newValue); newM[newValue] = []; newS[newValue] = ["Мягкий", "Средний", "Крепкий"]; }
      if(addItemModal?.type === 'sub') newM[topCategory] = [...(newM[topCategory] || []), newValue];
      if(addItemModal?.type === 'strength') newS[topCategory] = [...(newS[topCategory] || []), newValue];
      setTopCats(newT); setSubsMap(newM); setStrengthsMap(newS);
      syncSystem(newT, newM, newS);
      setNewValue(""); setAddItemModal(null);
  };

  const handleDeleteItem = () => {
      if(!confirmDelete) return;
      let newT = [...topCats];
      let newM = {...subsMap};
      let newS = {...strengthsMap};
      if(confirmDelete.type === 'top') { newT = newT.filter(x => x !== confirmDelete.val); delete newM[confirmDelete.val]; delete newS[confirmDelete.val]; setTopCategory("Все"); }
      if(confirmDelete.type === 'sub') newM[topCategory] = (newM[topCategory] || []).filter(x => x !== confirmDelete.val);
      if(confirmDelete.type === 'strength') newS[topCategory] = (newS[topCategory] || []).filter(x => x !== confirmDelete.val);
      setTopCats(newT); setSubsMap(newM); setStrengthsMap(newS);
      syncSystem(newT, newM, newS);
      setConfirmDelete(null);
  };

  const toggleDayProduct = (product: Tea) => {
    const newList = products.map(p => {
        if (p.id === product.id) return { ...p, isDayTea: !p.isDayTea };
        if (p.type === product.type) return { ...p, isDayTea: false };
        return p;
    });
    saveProductsData(newList);
  };

  const handleSaveProduct = () => {
    let list = [...products];
    const newId = editingId || `p_${Date.now()}`;
    const data = { ...formData, id: newId } as Tea;
    if (data.isDayTea) list = list.map(p => p.type === data.type ? { ...p, isDayTea: false } : p);
    if (editingId) list = list.map(p => p.id === editingId ? data : p);
    else list.push(data);
    
    saveProductsData(list);
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', type: topCats[0], category: (subsMap[topCats[0]] || [])[0], strength: (strengthsMap[topCats[0]] || [])[0], summary: '', desc: '', img: '', isDayTea: false });
  };

  const confirmProductDeleteAction = () => {
      if(productToDelete) {
          saveProductsData(products.filter(p => p.id !== productToDelete.id));
          setProductToDelete(null);
      }
  };

  const filtered = products.filter(p => {
    const mSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const mTop = topCategory === "Все" || p.type === topCategory;
    const mSub = activeCategory === "Все" || p.category === activeCategory;
    const mStr = activeStrength === "Все" || p.strength === activeStrength;
    return mSearch && mTop && mSub && mStr;
  });

  // НАХОДИМ ПРОДУКТ ДНЯ ВО ВСЕЙ БАЗЕ
  const dayProduct = products.find(p => p.isDayTea);

  if (!isMounted) {
    return (
      <div style={{ backgroundColor: '#0d0f0d', minHeight: '100vh', color: '#fff', display: 'flex', transition: '0.3s' }}>
        <Navigation />
        <div style={{ width: '260px', transition: '0.3s', flexShrink: 0 }} />
        <main style={{ flex: 1, padding: '120px 60px 60px 60px', transition: '0.3s' }}></main>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#0d0f0d', minHeight: '100vh', color: '#fff', display: 'flex', transition: '0.3s' }}>
      <Navigation />
      <div style={{ width: '260px', transition: '0.3s', flexShrink: 0 }} />

      <main style={{ flex: 1, padding: '120px 60px 60px 60px', transition: '0.3s' }}>
        
        <div className="search-layout-grid" style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: isAdmin ? '1fr 340px' : '1fr', gap: '40px' }}>
        
          <section>
            {/* ПРОДУКТ ДНЯ */}
            {dayProduct && (
              <div onClick={() => setSelectedTea(dayProduct)} style={dayTeaCard as any}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#000', fontSize: '11px', fontWeight: '900' }}>
                  <CustomIcon name="day" size={20} color="#000" />
                  <span>{dayProduct.type.toUpperCase() } ДНЯ</span>
                </div>
                <h2 style={{ color: '#000', fontSize: '36px', margin: '12px 0', lineHeight: '1.1', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{dayProduct.name}</h2>
                <p style={{ color: '#000', lineHeight: '1.5', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{dayProduct.summary}</p>
              </div>
            )}

            <input type="text" placeholder="Поиск по названию..." value={search} onChange={e => setSearch(e.target.value)} style={inputStyle as any} />
            
            <div style={filterContainer}>
              <div onClick={() => {setTopCategory("Все"); setActiveCategory("Все"); setActiveStrength("Все");}} style={{ ...badge, backgroundColor: topCategory === "Все" ? '#0abab5' : '#161816', color: topCategory === "Все" ? '#000' : '#fff' } as any}>Все</div>
              {topCats.map(c => (
                <div key={c} style={{ position: 'relative' }}>
                  <div onClick={() => {setTopCategory(c); setActiveCategory("Все"); setActiveStrength("Все");}} style={{ ...badge, backgroundColor: topCategory === c ? '#0abab5' : '#161816', color: topCategory === c ? '#000' : '#fff' } as any}>{c}</div>
                  {isAdmin && <span onClick={(e)=>{e.stopPropagation(); setConfirmDelete({type:'top', val:c})}} style={delXStyle as any}>X</span>}
                </div>
              ))}
              {isAdmin && <div onClick={() => setAddItemModal({type:'top'})} style={addPlusStyle as any}>+</div>}
            </div>

            {topCategory !== "Все" && (
              <div style={filterContainer}>
                <div onClick={() => setActiveCategory("Все")} style={{ ...badge, fontSize: '13px', backgroundColor: activeCategory === "Все" ? '#333' : '#161816' } as any}>Все виды</div>
                {(subsMap[topCategory] || []).map(s => (
                  <div key={s} style={{ position: 'relative' }}>
                    <div onClick={() => setActiveCategory(s)} style={{ ...badge, fontSize: '13px', backgroundColor: activeCategory === s ? '#333' : '#161816' } as any}>{s}</div>
                    {isAdmin && <span onClick={(e)=>{e.stopPropagation(); setConfirmDelete({type:'sub', val:s})}} style={delXStyle as any}>X</span>}
                  </div>
                ))}
                {isAdmin && <div onClick={() => setAddItemModal({type:'sub'})} style={{...addPlusStyle, minWidth:'40px', height:'35px'} as any}>+</div>}
              </div>
            )}

            {/* ФИЛЬТР УРОВНЕЙ КРЕПОСТИ */}
            {topCategory !== "Все" && (
               <div style={strengthFilterRow as any}>
                  <div onClick={() => setActiveStrength("Все")} style={{ ...badge, fontSize: '12px', padding: '8px 16px', backgroundColor: activeStrength === "Все" ? '#0abab5' : '#111', color: activeStrength === "Все" ? '#000' : '#fff' } as any}>Все уровни</div>
                  {(strengthsMap[topCategory] || []).map(s => (
                  <div key={s} style={{ position: 'relative' }}>
                      <div onClick={() => setActiveStrength(s)} style={{ ...badge, fontSize: '12px', padding: '8px 16px', backgroundColor: activeStrength === s ? '#0abab5' : '#111', color: activeStrength === s ? '#000' : '#fff' } as any}>{s}</div>
                      {isAdmin && <span onClick={(e)=>{e.stopPropagation(); setConfirmDelete({type:'strength', val:s})}} style={delXStyle as any}>X</span>}
                  </div>
                  ))}
                  {isAdmin && <div onClick={() => setAddItemModal({type:'strength'})} style={{...addPlusStyle, minWidth:'40px', height:'32px'} as any}>+</div>}
              </div>
            )}

            <div style={{ display: 'grid', gap: '12px' }}>
              {filtered.map(p => (
                <div key={p.id} onClick={() => setSelectedTea(p)} style={productRow as any}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>{p.name} {p.isDayTea && <span style={inlineStatusBadge as any}><CustomIcon name="day" size={14} color="#0abab5" /></span>}</h3>
                    <p style={{ margin: '5px 0 0 0', color: '#444', fontSize: '13px' }}>{p.summary}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <span onClick={(e) => { e.stopPropagation(); toggleDayProduct(p); }} style={{ ...smallActionBadge, color: p.isDayTea ? '#0abab5' : '#666', borderColor: p.isDayTea ? '#0abab5' : '#333' } as any}><CustomIcon name="day" size={15} color={p.isDayTea ? '#0abab5' : '#666'} /></span>
                        <span onClick={(e) => { e.stopPropagation(); setEditingId(p.id); setFormData(p); setShowForm(true); }} style={{ ...smallActionBadge, color: '#0abab5', borderColor: '#0abab5' } as any}><CustomIcon name="edit" size={15} color="#0abab5" /></span>
                        <span onClick={(e) => { e.stopPropagation(); setProductToDelete(p); }} style={{ color: '#ff7675', cursor: 'pointer', display: 'inline-flex' }}><CustomIcon name="close" size={18} color="#ff7675" /></span>
                      </div>
                    )}
                    <div style={{ color: '#0abab5', fontWeight: '900', fontSize: '11px', border: '1px solid #4CAF5044', padding: '4px 10px', borderRadius: '8px' }}>{p.strength}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {isAdmin && (
            <aside style={{ position: 'sticky', top: '120px' }}>
              <div style={adminSidebar as any}>
                <h3 style={{ color: '#0abab5', fontSize: '14px', marginBottom: '25px', textAlign: 'center', fontWeight: '900' }}>МАСТЕР-ПАНЕЛЬ</h3>
                <button onClick={() => { setEditingId(null); setFormData({name:'', type: topCategory==='Все' ? topCats[0] : topCategory, category: (subsMap[topCategory] || [])[0] || '', strength: (strengthsMap[topCategory] || [])[0] || ''}); setShowForm(true); }} style={saveBtn as any}>+ НОВЫЙ ПРОДУКТ</button>
                <p style={{ fontSize: '11px', color: '#444', textAlign: 'center', marginTop: '20px', lineHeight: '1.5' }}>Используйте <b>+</b> и <b>X</b> прямо в плитках фильтров.</p>
              </div>
            </aside>
          )}
        </div>

        {/* МОДАЛКА УДАЛЕНИЯ ПРОДУКТА */}
        {productToDelete && (
            <div style={modalOverlay as any}>
                <div style={modalContentSmall as any}>
                    <h2 style={{color:'#ff7675', marginBottom:'20px', fontWeight:'900'}}>УДАЛИТЬ ТОВАР?</h2>
                    <p style={{marginBottom:'25px', color:'#888', lineHeight:'1.5'}}>Вы уверены, что хотите удалить <b>«{productToDelete.name}»</b>?<br/>Это действие нельзя отменить.</p>
                    <div style={{display:'flex', gap:'10px'}}>
                        <button onClick={confirmProductDeleteAction} style={{...saveBtn, background:'#ff7675', flex:1} as any}>УДАЛИТЬ</button>
                        <button onClick={()=>setProductToDelete(null)} style={{...saveBtn, background:'#333', flex:1} as any}>ОТМЕНА</button>
                    </div>
                </div>
            </div>
        )}

        {addItemModal && (
            <div style={modalOverlay as any}>
                <div style={modalContentSmall as any}>
                    <h2 style={{color:'#0abab5', marginBottom:'20px'}}>НОВЫЙ ЭЛЕМЕНТ</h2>
                    <input autoFocus style={inputStyle as any} placeholder="Название..." value={newValue} onChange={(e)=>setNewValue(e.target.value)} onKeyDown={(e)=>e.key==='Enter'&&handleAddItem()} />
                    <button onClick={handleAddItem} style={{...saveBtn, width:'100%'} as any}>ДОБАВИТЬ</button>
                    <div onClick={()=>setAddItemModal(null)} style={{textAlign:'center', marginTop:'15px', cursor:'pointer', color:'#666'}}>Отмена</div>
                </div>
            </div>
        )}

        {confirmDelete && (
            <div style={modalOverlay as any}>
                <div style={modalContentSmall as any}>
                    <h2 style={{color:'#ff7675', marginBottom:'15px'}}>УДАЛИТЬ КАТЕГОРИЮ?</h2>
                    <p style={{marginBottom:'25px', color:'#888'}}>Удалить «{confirmDelete.val}» из системы?</p>
                    <button onClick={handleDeleteItem} style={{...saveBtn, background:'#ff7675', width:'100%'} as any}>ДА, УДАЛИТЬ</button>
                    <div onClick={()=>setConfirmDelete(null)} style={{textAlign:'center', marginTop:'15px', cursor:'pointer', color:'#666'}}>Отмена</div>
                </div>
            </div>
        )}

        {/* ПРОСМОТР ПРОДУКТА */}
        {selectedTea && (
          <div style={fullOverlay as any}>
            <div style={{ maxWidth: '750px', margin: '0 auto' }}>
              <div onClick={() => setSelectedTea(null)} style={{ color: '#0abab5', marginBottom: '30px', cursor: 'pointer', fontWeight: '900' }}>← ЗАКРЫТЬ</div>
              <h2 style={{ fontSize: '48px', color: '#0abab5', margin: '0 0 10px 0', lineHeight: '1.05', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{selectedTea.name}</h2>
              <div style={fullImageWrap as any}><img src={selectedTea.img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={selectedTea.name} /></div>
              <p style={{ fontSize: '20px', lineHeight: '1.8', color: '#ccc', marginBottom: '40px' }}>{selectedTea.desc}</p>
              <div className="search-info-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '40px' }}>
                <div style={{ ...infoBox, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: '1.5' } as any}><div style={infoTag as any}><CustomIcon name="globe" size={16} color="#0abab5" /> РЕГИОН</div>{selectedTea.region || '—'}</div>
                <div style={{ ...infoBox, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: '1.5' } as any}><div style={infoTag as any}><CustomIcon name="brew" size={16} color="#0abab5" /> ЗАВАРИВАНИЕ</div>{selectedTea.brewGuide || selectedTea.info}</div>
                <div style={{ ...infoBox, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: '1.5' } as any}><div style={infoTag as any}><CustomIcon name="idea" size={16} color="#0abab5" /> СОВЕТ</div>{selectedTea.advice || '—'}</div>
                <div style={{ ...infoBox, wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: '1.5' } as any}><div style={infoTag as any}><CustomIcon name="refresh" size={16} color="#0abab5" /> ОТЛИЧИЕ</div>{selectedTea.analogsDiff || '—'}</div>
              </div>
              <button onClick={() => { setQuizResults({}); setShowQuiz(true); }} style={{...checkBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px'} as any}><CustomIcon name="brain" size={20} color="#000" /> ПРОВЕРИТЬ СЕБЯ</button>
            </div>
          </div>
        )}

        {/* РЕДАКТОР ПРОДУКТА */}
        {showForm && (
          <div style={modalOverlay as any}>
            <div style={{ ...modalContent, maxWidth: '500px' } as any}>
              <h2 style={{ textAlign: 'center', marginBottom: '25px', fontWeight: '900' }}>{editingId ? 'РЕДАКТОР' : 'НОВЫЙ ПРОДУКТ'}</h2>
              <input style={adminIn as any} placeholder="Название" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <select style={adminIn as any} value={formData.type} onChange={e => setFormData({...formData, type: e.target.value, category: (subsMap[e.target.value] || [])[0] || '', strength: (strengthsMap[e.target.value] || [])[0] || ''})}>
                    {topCats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select style={adminIn as any} value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                    {(subsMap[formData.type || 'Чай'] || []).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <select style={adminIn as any} value={formData.strength} onChange={e => setFormData({...formData, strength: e.target.value})}>
                  {(strengthsMap[formData.type || 'Чай'] || []).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <textarea style={{ ...adminIn, height: '100px' } as any} placeholder="Описание" value={formData.desc} onChange={e => setFormData({...formData, desc: e.target.value})} />
              <input style={adminIn as any} placeholder="Регион" value={formData.region} onChange={e => setFormData({...formData, region: e.target.value})} />
              <input style={adminIn as any} placeholder="Советы" value={formData.advice} onChange={e => setFormData({...formData, advice: e.target.value})} />
              <input style={adminIn as any} placeholder="URL фото" value={formData.img} onChange={e => setFormData({...formData, img: e.target.value})} />
              <label style={{ display: 'flex', gap: '10px', marginBottom: '20px', cursor: 'pointer' }}><input type="checkbox" checked={formData.isDayTea} onChange={e => setFormData({...formData, isDayTea: e.target.checked})} /> Продукт дня </label>
              <button onClick={handleSaveProduct} style={saveBtn as any}>СОХРАНИТЬ</button>
              <div onClick={() => setShowForm(false)} style={{ textAlign: 'center', marginTop: '20px', color: '#666', cursor: 'pointer' }}>ОТМЕНА</div>
            </div>
          </div>
        )}

        {/* ТЕСТ */}
      {showQuiz && selectedTea && (
          <div style={{ ...modalOverlay, zIndex: 30000 } as any}>
            <div style={modalContent as any}>
              <h3 style={{ color: '#0abab5', marginBottom: '25px' }}>ТЕСТ: {selectedTea.name}</h3>
              {(selectedTea.quiz || [{q: "Профиль понятен?", o: ["Да", "Нет", "Частично"], c: 0}]).map((q, idx) => (
                <div key={idx} style={{ marginBottom: '25px' }}>
                  <p style={{ fontWeight: 'bold', marginBottom: '15px' }}>{q.q}</p>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {q.o.map((opt, oIdx) => {
                      const isCorrect = oIdx === q.c;
                      const isSelected = quizResults[selectedTea.id as number]?.includes(oIdx);
                      return (
                        <div key={oIdx} onClick={() => setQuizResults({...quizResults, [selectedTea.id as number]: [...(quizResults[selectedTea.id as number] || []), oIdx]})} style={{ padding: '18px', background: isSelected ? (isCorrect ? '#0abab5' : '#d32f2f') : '#000', borderRadius: '12px', cursor: 'pointer', border: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } as any}>
                          {opt} <span>{isSelected && (isCorrect ? <CustomIcon name="check" size={18} color="#000" /> : <CustomIcon name="x" size={18} color="#fff" />)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div onClick={() => setShowQuiz(false)} style={{ textAlign: 'center', marginTop: '20px', color: '#666', cursor: 'pointer', fontWeight: 'bold' }}>ЗАВЕРШИТЬ ТЕСТ</div>
            </div>
          </div>
      )}

      <style jsx>{`
        @media (max-width: 980px) {
          .search-layout-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 720px) {
          .search-info-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  </div>
);
}

export default function ProductsPage() {
    return <Suspense fallback={<div style={{ backgroundColor: '#0d0f0d', minHeight: '100vh'}} />}><ProductsContent /></Suspense>;
}

// --- СТИЛИ ---
const filterContainer = { display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' as any, alignItems: 'center' };
const addPlusStyle = { minWidth: '50px', background: '#111', borderRadius: '25px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#0abab5', border: '1px dashed #0abab5', fontSize: '20px' };
const delXStyle = { position: 'absolute' as any, top: '-5px', right: '-5px', background: '#ff7675', color: '#fff', width: '16px', height: '16px', borderRadius: '50%', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid #0d0f0d' };
const modalContentSmall = { background: '#161816', padding: '40px', borderRadius: '40px', width: '100%', maxWidth: '400px', border: '1px solid #333', textAlign: 'center' };
const badge = { padding: '10px 24px', borderRadius: '25px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' };
const inputStyle = { width: '100%', padding: '18px', borderRadius: '15px', background: '#161816', border: '1px solid #222', color: '#fff', marginBottom: '25px', outline: 'none' };
const dayTeaCard = { background: 'linear-gradient(135deg, #0abab5 0%, #161816 100%)', padding: '40px', borderRadius: '35px', border: '1px solid #0abab5', cursor: 'pointer', marginBottom: '35px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' };
const dayBadgeMark = { background: '#000', color: '#0abab5', border: '1px solid rgba(10,186,181,0.4)', borderRadius: '8px', padding: '4px 8px', fontSize: '10px', fontWeight: '900', letterSpacing: '1px' };
const inlineStatusBadge = { display: 'inline-block', marginLeft: '8px', color: '#0abab5', border: '1px solid rgba(10,186,181,0.35)', borderRadius: '8px', padding: '2px 6px', fontSize: '10px', fontWeight: '900', verticalAlign: 'middle' };
const smallActionBadge = { cursor: 'pointer', border: '1px solid #333', borderRadius: '8px', padding: '5px 8px', fontSize: '10px', fontWeight: '900', letterSpacing: '0.5px' };
const strengthFilterRow = { background: '#121412', padding: '12px', borderRadius: '20px', border: '1px solid #222', marginBottom: '25px', display: 'flex', gap: '10px', overflowX: 'auto' as any, alignItems: 'center' };
const productRow = { background: '#161816', padding: '24px 30px', borderRadius: '25px', border: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' };
const adminSidebar = { background: '#161816', padding: '30px', borderRadius: '35px', border: '1px solid #222' };
const adminIn = { width: '100%', padding: '14px', background: '#000', border: '1px solid #222', borderRadius: '12px', color: '#fff', marginBottom: '12px', outline: 'none', fontSize: '14px' };
const saveBtn = { width: '100%', padding: '18px', background: '#0abab5', color: '#000', border: 'none', borderRadius: '15px', fontWeight: '900', cursor: 'pointer' };
const fullOverlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: '#0d0f0d', zIndex: 15000, padding: '40px 20px', overflowY: 'auto' } as any;
const fullImageWrap = { width: '100%', height: '380px', borderRadius: '35px', overflow: 'hidden', border: '1px solid #222', margin: '30px 0' };
const infoBox = { background: '#161816', padding: '25px', borderRadius: '25px', border: '1px solid #222' };
const infoTag = { color: '#0abab5', fontSize: '11px', fontWeight: '900', marginBottom: '8px', letterSpacing: '1px' };
const checkBtn = { width: '100%', padding: '25px', background: '#0abab5', border: 'none', borderRadius: '20px', fontWeight: '900', color: '#000', fontSize: '18px', cursor: 'pointer' };
const modalOverlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.96)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20000, padding: '20px' };
const modalContent = { background: '#111', padding: '40px', borderRadius: '40px', width: '100%', border: '1px solid #222', maxHeight: '90vh', overflowY: 'auto' };
