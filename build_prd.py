from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.section import WD_SECTION
from pathlib import Path

out = Path(r'C:\Users\ncucc\Desktop\1030\個人習慣管理系統_MVP_PRD.docx')
doc = Document()
sec = doc.sections[0]
sec.top_margin = Inches(.72); sec.bottom_margin = Inches(.68); sec.left_margin = Inches(.78); sec.right_margin = Inches(.78)
sec.header_distance = Inches(.35); sec.footer_distance = Inches(.35)

# Global type system
styles=doc.styles
for nm in ('Normal','Title','Subtitle','Heading 1','Heading 2','Heading 3'):
    st=styles[nm]
    st.font.name='Aptos'
    st._element.rPr.rFonts.set(qn('w:eastAsia'),'Microsoft JhengHei')
styles['Normal'].font.size=Pt(9.5); styles['Normal'].font.color.rgb=RGBColor(47,54,47)
styles['Normal'].paragraph_format.space_after=Pt(5); styles['Normal'].paragraph_format.line_spacing=1.12
styles['Title'].font.size=Pt(29); styles['Title'].font.bold=True; styles['Title'].font.color.rgb=RGBColor(0,0,0)
styles['Title'].paragraph_format.space_after=Pt(6)
styles['Subtitle'].font.size=Pt(11); styles['Subtitle'].font.color.rgb=RGBColor(83,116,93)
styles['Heading 1'].font.size=Pt(17); styles['Heading 1'].font.bold=True; styles['Heading 1'].font.color.rgb=RGBColor(0,0,0)
styles['Heading 1'].paragraph_format.space_before=Pt(14); styles['Heading 1'].paragraph_format.space_after=Pt(7); styles['Heading 1'].paragraph_format.keep_with_next=True
styles['Heading 2'].font.size=Pt(12); styles['Heading 2'].font.bold=True; styles['Heading 2'].font.color.rgb=RGBColor(0,0,0)
styles['Heading 2'].paragraph_format.space_before=Pt(8); styles['Heading 2'].paragraph_format.space_after=Pt(4); styles['Heading 2'].paragraph_format.keep_with_next=True
styles['Heading 3'].font.size=Pt(10); styles['Heading 3'].font.bold=True; styles['Heading 3'].font.color.rgb=RGBColor(0,0,0)

def shade(cell, fill):
    tcPr=cell._tc.get_or_add_tcPr(); shd=OxmlElement('w:shd'); shd.set(qn('w:fill'),fill); tcPr.append(shd)
def set_cell_margins(cell, top=90, start=110, bottom=90, end=110):
    tc=cell._tc; tcPr=tc.get_or_add_tcPr(); mar=tcPr.first_child_found_in('w:tcMar')
    if mar is None: mar=OxmlElement('w:tcMar'); tcPr.append(mar)
    for m,v in [('top',top),('start',start),('bottom',bottom),('end',end)]:
        node=mar.find(qn('w:'+m))
        if node is None: node=OxmlElement('w:'+m); mar.append(node)
        node.set(qn('w:w'),str(v)); node.set(qn('w:type'),'dxa')
def set_table_borders(table, color='D9DFD8'):
    tblPr=table._tbl.tblPr; borders=OxmlElement('w:tblBorders')
    for edge in ('top','left','bottom','right','insideH','insideV'):
        e=OxmlElement('w:'+edge); e.set(qn('w:val'),'single'); e.set(qn('w:sz'),'5'); e.set(qn('w:space'),'0'); e.set(qn('w:color'),color); borders.append(e)
    tblPr.append(borders)
def table(headers, rows, widths=None, font=8.2):
    t=doc.add_table(rows=1, cols=len(headers)); t.alignment=WD_TABLE_ALIGNMENT.CENTER; t.autofit=False
    if widths:
        for col,w in zip(t.columns,widths): col.width=Inches(w)
    for i,h in enumerate(headers):
        c=t.rows[0].cells[i]; c.text=h; shade(c,'355B43')
        for p in c.paragraphs:
            p.paragraph_format.space_after=Pt(0)
            for r in p.runs: r.bold=True; r.font.size=Pt(font); r.font.color.rgb=RGBColor(255,255,255)
        c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER; set_cell_margins(c)
    trPr=t.rows[0]._tr.get_or_add_trPr(); repeat=OxmlElement('w:tblHeader'); repeat.set(qn('w:val'),'true'); trPr.append(repeat)
    for ri,row in enumerate(rows):
        cells=t.add_row().cells
        if widths:
            for c,w in zip(cells,widths): c.width=Inches(w)
        for i,val in enumerate(row):
            cells[i].text=str(val); cells[i].vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER; set_cell_margins(cells[i])
            if ri%2: shade(cells[i],'F4F7F3')
            for p in cells[i].paragraphs:
                p.paragraph_format.space_after=Pt(1); p.paragraph_format.line_spacing=1.05
                for r in p.runs: r.font.size=Pt(font)
    set_table_borders(t)
    doc.add_paragraph().paragraph_format.space_after=Pt(1)
    return t
def para(text='', boldlead=None, style=None):
    p=doc.add_paragraph(style=style)
    if boldlead and text.startswith(boldlead):
        r=p.add_run(boldlead); r.bold=True; p.add_run(text[len(boldlead):])
    else: p.add_run(text)
    return p
def bullet(text, level=0):
    p=doc.add_paragraph(style='List Bullet' if level==0 else 'List Bullet 2'); p.paragraph_format.space_after=Pt(2); p.paragraph_format.left_indent=Inches(.24+level*.18); p.paragraph_format.first_line_indent=Inches(-.14); p.add_run(text); return p
def heading(text, level=1): doc.add_heading(text, level=level)

# Header/footer
header=sec.header.paragraphs[0]; header.alignment=WD_ALIGN_PARAGRAPH.RIGHT
rr=header.add_run('日日｜個人習慣管理系統 · MVP PRD'); rr.font.size=Pt(8); rr.font.color.rgb=RGBColor(110,120,109)
footer=sec.footer.paragraphs[0]; footer.alignment=WD_ALIGN_PARAGRAPH.CENTER
fr=footer.add_run('產品需求文件  •  版本 1.0  •  2026-10-30'); fr.font.size=Pt(8); fr.font.color.rgb=RGBColor(130,136,127)

# Cover/title opening
p=doc.add_paragraph(); p.paragraph_format.space_before=Pt(26); p.paragraph_format.space_after=Pt(3)
r=p.add_run('產品需求文件  /  MVP'); r.bold=True; r.font.size=Pt(9); r.font.color.rgb=RGBColor(82,116,93)
doc.add_paragraph('個人習慣管理系統',style='Title')
doc.add_paragraph('日日｜以穩定養成為核心的個人行程與習慣追蹤產品',style='Subtitle')
para('本文件定義目前 MVP 的產品範圍、核心流程、功能需求與驗收條件。產品聚焦協助使用者在多重日常安排中記得固定習慣、即時或事後留下紀錄，並透過可量化目標看見持續累積；不把一般一次性待辦納入本次版本。')
table(['文件資訊','內容'],[
('文件版本','1.0'),('狀態','MVP 需求基線（依目前可操作前端原型整理）'),('產品平台','響應式 Web 前端原型'),('目標使用者','需持續執行每日／每週習慣，並希望記錄成果進度的個人使用者'),('資料保存','目前原型使用瀏覽器 localStorage；無帳號與雲端同步'),('文件日期','2026 年 10 月 30 日')],[1.45,5.55])

heading('1 產品概述')
heading('1.1 問題與機會',2)
para('使用者每天或每週安排多項約 30 分鐘的習慣（例如閱讀、伸展、日文學習），容易在其他任務中忘記執行；即使完成，也缺少簡單、低負擔且可回顧的紀錄方式。對長期成果（例如年底通過日文 N3），單純打卡無法呈現學習累積或階段性成果。')
heading('1.2 產品願景',2)
para('讓使用者能在早晨快速掌握今天的習慣，在習慣完成時一鍵記錄，並依需要補上學習內容、心情與實際投入時間；以個別目標進度和回顧降低遺忘、提高持續性。')
heading('1.3 MVP 成功指標（建議）',2)
table(['指標','定義','MVP 觀察方式'],[
('習慣建檔率','完成至少一項習慣排程的使用者比例','原型可用性測試任務完成率'),('打卡完成率','指定期間完成數 ÷ 已排程習慣數（排除跳過）','習慣回顧頁的狀態統計'),('紀錄完成率','完成且有記錄評語／時數的目標習慣比例','目標習慣的學習紀錄'),('目標進度可理解性','使用者能正確說明進度百分比來源','可用性測試訪談與任務觀察')],[1.35,3.0,2.65])

heading('2 目標使用者與需求')
table(['角色／情境','需求','產品回應'],[
('習慣養成者','有多項每日／每週習慣，常忘記固定練習','今日清單、固定時間、排程摘要、完成／跳過狀態'),('長期目標追蹤者','希望知道累積時數或階段成果是否接近期限','目標期限、時數累積、里程碑勾選、進度條'),('反思記錄者','完成後不一定有空記錄，想保留內容與心情','可選擇啟用自由文字小記與 emoji，支援事後補記')],[1.35,2.7,2.95])
heading('2.1 使用者故事',2)
for x in [
'身為習慣養成者，我希望早晨看到今天排程，才能知道今天預計做哪些練習。',
'身為習慣養成者，我希望完成後快速打卡，也能標記今天跳過，讓紀錄符合實際狀況。',
'身為目標追蹤者，我希望為習慣設定目標期限、累積時數或子目標，並看到每個目標自己的進度。',
'身為學習者，我希望完成時或之後補寫今天學到的文法，並以 emoji 標記心情。',
'身為使用者，我希望修改習慣設定時保留既有狀態、評語與目標紀錄。'] : bullet(x)

heading('3 MVP 範圍')
heading('3.1 本次包含',2)
for x in ['今日習慣清單與日進度摘要。','建立及編輯習慣：名稱、圖示、固定時間、每日目標時長、重複星期。','習慣日狀態：完成、未完成、今天跳過；支援撤銷／補記。','每個習慣可選擇設定成果目標、目標日期、補充說明。','目標進度追蹤可複選：累積時數與子目標／里程碑。','個別目標進度百分比與進度條；可檢視里程碑清單和學習日誌。','每個習慣可個別開啟／關閉自由文字評語；支援 emoji 心情與事後補記。','目標型習慣可記錄每日實際投入分鐘，累積時數目標據此更新。','內建習慣行事曆、日期檢視、今日回顧、近七日完成狀況。','響應式版面與瀏覽器本機資料保存。'] : bullet(x)
heading('3.2 本次不包含',2)
for x in ['一般一次性待辦、專案管理或任務依賴。','Google／Apple／Outlook 外部行事曆同步。','具排程背景執行能力的準時推播；目前瀏覽器通知僅為權限／通知展示原型。','帳號登入、多裝置同步、雲端備份與分享。','自動判斷 N3 能力或考試通過機率；里程碑完成由使用者手動紀錄。','習慣統計匯出、附件、語音輸入或社群功能。'] : bullet(x)

heading('4 資訊架構與主要畫面')
table(['畫面／區域','主要內容','主要操作'],[
('今日習慣','問候與日期、今日完成環、完成／待完成數、排程習慣卡、下一項習慣','新增、完成／跳過、編輯、目標進度、記一筆'),('習慣行事曆','月曆日期選擇、週排程摘要','選擇日期查看該日習慣'),('習慣回顧','最近七日完成摘要、每日完成／未完成／跳過狀態','檢視每日摘要、補記習慣小記'),('習慣編輯','習慣基本資訊、重複日、成果目標、追蹤方式、評語開關','儲存新增或更新'),('目標進度','目標百分比、累積時數、里程碑、學習日誌','勾選里程碑、檢查歷程'),('小記','心情 emoji、自由文字、實際投入分鐘（時數追蹤時）','儲存或稍後補記'),('偏好設定','瀏覽器通知提示、內建行事曆說明','請求瀏覽器通知權限')],[1.25,3.2,2.55])

heading('5 功能需求與驗收條件')
heading('5.1 習慣管理',2)
table(['ID','需求','驗收條件／規則','優先級'],[
('HAB-01','新增習慣','必填習慣名稱、開始時間、每日目標時長及至少一個重複日；成功後出現在符合日期的今日清單。','P0'),('HAB-02','編輯習慣','可編輯名稱、圖示、時間、時長、重複日、目標與評語開關；更新不清除歷史狀態、評語及時數日誌。','P0'),('HAB-03','顯示排程','習慣依開始時間排序；卡片顯示時間、每日目標時長與每週重複天數。','P0'),('HAB-04','完成打卡','將所選日期狀態設為完成；可撤銷回未完成。若目標追蹤時數且當日尚無時數，建立預設時長紀錄。','P0'),('HAB-05','跳過','可將所選日期設為跳過；跳過不視為完成，也不自動順延；可撤銷。','P0'),('HAB-06','日期補記','從行事曆選擇日期後，可檢視／修改該日排程狀態與評語。','P1')],[.62,1.05,4.45,.55],7.8)
heading('5.2 目標追蹤',2)
table(['ID','需求','驗收條件／規則','優先級'],[
('GOAL-01','成果目標設定','目標可設名稱、期限與補充說明；不設定時習慣仍可正常打卡。','P0'),('GOAL-02','累積時數','目標設定預計累積時數；每日實際分鐘累加為總時數，完成百分比 = min(累積分鐘 ÷ 目標分鐘, 100%)。','P0'),('GOAL-03','里程碑','使用者逐行輸入子目標，目標進度詳情中可勾選完成；百分比 = 已完成子目標 ÷ 子目標總數。','P0'),('GOAL-04','雙追蹤方式','可同時啟用時數與里程碑；顯示整體進度為兩個有效指標百分比的等權平均，並各自呈現明細。','P0'),('GOAL-05','進度顯示','有目標的習慣卡顯示名稱、個別百分比、進度條、累積摘要及期限；點選開啟詳細進度。','P0'),('GOAL-06','時數日誌','打卡時預設以習慣每日目標時長紀錄；評語頁允許修改為實際分鐘；已有手動時數時打卡不得覆蓋。','P0'),('GOAL-07','編輯目標','修改目標設定或里程碑文字時保留已存在目標日誌；同名里程碑保留原完成狀態。','P1')],[.62,1.05,4.45,.55],7.6)
heading('5.3 評語與回顧',2)
table(['ID','需求','驗收條件／規則','優先級'],[
('NOTE-01','個別開關','每個習慣可個別啟用評語；關閉時不在卡片顯示「記一筆」入口。','P0'),('NOTE-02','自由文字與心情','評語可輸入自由文字並選一個心情 emoji；至少支援 😊 🥰 😌 💪 🤓 😅 🥱 🌧️ ✨。','P0'),('NOTE-03','完成後記錄','使用者可於當日習慣卡打卡後直接新增或編輯小記。','P0'),('NOTE-04','事後補記','可從回顧／日期視圖為過往日期新增、修改評語及心情。','P0'),('NOTE-05','今日回顧','摘要顯示完成、未完成、跳過數，並依習慣列出當日狀態及補記入口。','P1')],[.62,1.05,4.45,.55],7.7)

heading('6 進度計算與資料規則')
heading('6.1 時數進度計算',2)
para('每筆學習紀錄以日期保存實際投入分鐘。同一習慣、同一天只計一筆時數，以避免打卡重複累加。完成打卡時若沒有該日紀錄，系統建立預設值（習慣每日目標時長）；若已手動輸入當日分鐘，則保留既有分鐘。評語表單可調整當日實際分鐘，即使事後補記亦可計入。')
para('時數百分比 = min(累計實際分鐘 ÷ (預計累積時數 × 60), 1) × 100%。里程碑百分比 = 已勾選數 ÷ 里程碑總數 × 100%。兩種來源同時開啟時，整體進度 = 有效指標的等權平均；每個指標另行顯示。若目標期限為年底，未來可增加「期限內預期累積」視圖，但當前原型的百分比是對使用者設定的總時數目標進度，不代表期限進度或考試通過率。')
heading('6.2 狀態定義',2)
table(['狀態','定義','彙總規則'],[
('完成','使用者已執行並打卡的習慣','計入完成數；目標時數依實際日誌計入'),('未完成','未打卡或尚未處理的排程習慣','計入待完成數'),('跳過','使用者明確選擇當日不執行','不計完成；不順延；與未完成分開統計')],[1.0,3.0,3.1])
heading('6.3 主要資料實體',2)
table(['實體','關鍵欄位（摘要）'],[
('Habit','id、name、icon、time、durationMinutes、repeatDays、notesEnabled、statesByDate、notesByDate、goal'),('Goal','name、deadline、targetHours、trackHours、trackMilestones、description、milestones、dailyLogs'),('DailyStatus','habitId、date、status（done/open/skip）'),('DailyNote','habitId、date、moodEmoji、text'),('GoalDailyLog','habitId、date、actualMinutes、note')],[1.5,5.5])
para('資料關聯：一個習慣可有零或一個成果目標；每個習慣可按日期保存狀態和評語；目標按日期保存實際投入分鐘，按里程碑保存手動達成狀態。原型為 localStorage JSON，資料不會自動同步或跨瀏覽器備份。')

heading('7 主要使用流程')
heading('7.1 建立每日學習目標',2)
for x in ['使用者選擇「新增習慣」，輸入日文學習、20:00、每日 60 分鐘與重複星期。','啟用成果目標並輸入「年底通過日文 N3」、期限及預計累積時數。','同時啟用時數與里程碑，輸入單字、文法教材、模擬考等子目標。','啟用評語，儲存後在今日習慣卡看到獨立的目標進度。','完成打卡後系統記錄預設 60 分鐘；使用者可在小記中改為實際分鐘，選心情並寫下今天學的文法。','忘記當下記錄時，從行事曆選回該日，補記狀態與評語。','在目標進度頁勾選里程碑，檢視時數、子目標與整體進度。'] : bullet(x)
heading('7.2 編輯習慣',2)
para('使用者在習慣卡按「編輯」，調整固定時間、時長、重複日、期限、時數或里程碑。儲存後畫面更新，既有狀態、評語與每日目標日誌須保留。若調整目標總時數，歷史實際分鐘不變，百分比依新目標重新計算。')

heading('8 非功能需求與限制')
table(['面向','需求／限制'],[
('易用性','核心打卡應能由今日習慣卡直接完成；評語為選用，未啟用評語者維持低操作負擔。'),('響應式','支援桌面與手機瀏覽器；手機底部導覽，表單在窄螢幕可垂直捲動。'),('資料持久性','原型使用 localStorage；清除瀏覽器資料會遺失，無跨裝置同步。正式產品需評估雲端帳號／備份。'),('通知','瀏覽器通知需使用者授權；僅前端頁面無法保證關閉頁面仍準時通知。正式版需 Service Worker、排程服務或原生推播。'),('行事曆','目前為產品內部排程與日期檢視，不代表外部日曆整合。'),('隱私','評語可能包含個人學習資訊；正式版應說明保存、刪除、匯出與同步策略。'),('可存取性','互動控制應有可見焦點、鍵盤操作與標籤； emoji 僅作輔助情緒標記，不取代文字標籤。')],[1.25,5.75])

heading('9 MVP 風險與待決策事項')
table(['項目','風險／待確認','建議'],[
('目標等權平均','時數與里程碑對成果的貢獻未必相同；簡單平均可能讓百分比被誤讀。','保留分項百分比並明示等權平均；後續研究使用者是否需要權重設定。'),('時數預設','打卡即用目標時長可能高估實際投入。','目標習慣卡提供「完成後確認實際分鐘」選項；目前可進小記手動調整。'),('目標時限','總時數達成率不一定代表年底考試準備進度。','後續可加入按期限計算的預期累積曲線、每週目標或子目標權重。'),('資料只有本機','更換設備或清除網站資料會失去紀錄。','產品化前需定義登入、同步、匯出與備份。'),('背景提醒','僅依賴前端頁面無法可靠執行長期排程通知。','驗證提醒需求後再選 Web Push 或原生通知架構。'),('範例資料載入','本機已有舊版 localStorage 時，更新內建範例不一定覆蓋舊資料。','提供明確示範資料重置／載入選項，且不覆蓋使用者資料。')],[1.25,2.75,3.0],7.6)

heading('10 發布與驗收清單')
for x in ['使用者可新增一項每日或每週習慣並在正確日期出現。','使用者可編輯排程或目標，且既有狀態與小記不遺失。','完成、未完成、跳過三種狀態能正確區別；跳過不自動順延。','同一目標支援時數、里程碑或雙追蹤；進度條與詳細百分比一致。','每天時數只計一次；可事後輸入實際分鐘且保存。','可選擇評語開關；已啟用習慣可保存自由文字、emoji，並可補記過往日期。','行事曆選日、今日回顧及近七日摘要能反映所選日期資料。','重新整理頁面後本機資料仍存在；文件清楚說明沒有雲端同步。','窄螢幕下主要操作可用，對話框可捲動且按鈕未被遮擋。'] : bullet(x)

heading('附錄 A 原型已知行為')
para('本 PRD 根據目前 MVP 前端原型與需求討論整理。現有原型透過單一 HTML 檔執行，使用 localStorage 儲存；示範資料載入採「本機已有資料優先」模式，因此既有空資料或舊版資料可能讓新示範習慣不顯示。正式測試時需提供清除／載入示範資料入口。原型的瀏覽器提醒按鈕以授權與通知展示為主，沒有真正依每項習慣時間在背景觸發排程。')
para('PRD 範圍以產品意圖和目前介面能力為基準；上述不完整整合項目已列為限制，不應視為已交付的外部服務。')

# Keep title and heading lines together
for p in doc.paragraphs:
    if p.style.name.startswith('Heading'):
        p.paragraph_format.keep_with_next=True
# Core metadata
props=doc.core_properties; props.title='個人習慣管理系統 MVP 產品需求文件'; props.subject='日日習慣養成與目標追蹤產品 PRD'; props.author='產品團隊'; props.keywords='PRD, MVP, 習慣管理, 目標追蹤'
doc.save(out)
print(out)
