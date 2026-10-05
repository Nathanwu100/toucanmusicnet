// The site in another language.
//
// A visitor picks a language in Settings and it applies everywhere, signed
// in or not: it is kept in this browser, not on the account. The pages are
// written in English; this script holds the same sentences in Spanish and
// Chinese and swaps them in wherever they appear, in the markup on load and
// in anything a script draws later (the nav, the settings drawer, the
// calendar, the guided tour). A sentence that is not in the table stays in
// English, which is also what happens to names, places, class titles, and
// anything assembled from pieces at run time, such as "You are signed up
// for Beginner violin".
//
// Adding a language is a row in LANGUAGES and a column in STRINGS. Adding a
// sentence is a row in STRINGS, keyed by the English exactly as it is
// written in the page or the script.

(function () {
  "use strict";

  const KEY = "toucan_language";
  const LANGUAGES = [
    { code: "en", tag: "en", name: "English" },
    { code: "es", tag: "es", name: "Español" },
    { code: "zh", tag: "zh-Hans", name: "中文" },
  ];
  const COLUMN = { es: 0, zh: 1 };

  // English: [Spanish, Chinese]
  const STRINGS = {
    // ------------------------------------------------------------ chrome
    "Home": ["Inicio", "首页"],
    "About us": ["Quiénes somos", "关于我们"],
    "Calendar": ["Calendario", "日历"],
    "Settings": ["Ajustes", "设置"],
    "Your account": ["Tu cuenta", "你的账户"],
    "Log in": ["Iniciar sesión", "登录"],
    "Log out": ["Cerrar sesión", "退出登录"],
    "Join us": ["Únete", "加入我们"],
    "Close": ["Cerrar", "关闭"],
    "Close settings": ["Cerrar ajustes", "关闭设置"],
    "Open settings": ["Abrir ajustes", "打开设置"],
    "Notification settings": ["Ajustes de notificaciones", "通知设置"],
    "Organization": ["Organización", "组织"],
    "Our mission": ["Nuestra misión", "我们的使命"],
    "Contact": ["Contacto", "联系方式"],
    "Report a bug": ["Informar de un fallo", "报告问题"],
    "Free weekend piano, violin, and viola lessons in Palo Alto.": ["Clases gratuitas de piano, violín y viola los fines de semana en Palo Alto.", "帕洛阿尔托的免费周末钢琴、小提琴和中提琴课程。"],
    "Cancel": ["Cancelar", "取消"],
    "Email": ["Correo electrónico", "电子邮箱"],
    "Password": ["Contraseña", "密码"],
    "Instrument": ["Instrumento", "乐器"],
    "Language": ["Idioma", "语言"],
    "The site in your language. Names, places and class titles stay as they were written.": ["El sitio en tu idioma. Los nombres, lugares y títulos de las clases se quedan como se escribieron.", "以你的语言浏览本站。人名、地点和课程名称保持原文。"],

    // -------------------------------------------------------------- home
    "Toucan Music — Every child deserves a soundtrack": ["Toucan Music — Cada niño merece una banda sonora", "Toucan Music — 每个孩子都值得拥有一段配乐"],
    "Free weekend lessons · Palo Alto": ["Clases gratuitas los fines de semana · Palo Alto", "免费周末课程 · 帕洛阿尔托"],
    "Every child deserves": ["Cada niño merece", "每个孩子都值得拥有"],
    "a soundtrack.": ["una banda sonora.", "一段配乐。"],
    "We teach": ["Enseñamos", "我们教授"],
    "piano, violin, and viola": ["piano, violín y viola", "钢琴、小提琴和中提琴"],
    "at Mitchell Park Community Center every weekend. It costs nothing. You don't need an instrument, and you don't need to have played one before.": ["en el Mitchell Park Community Center cada fin de semana. No cuesta nada. No necesitas instrumento, ni haber tocado uno antes.", "，每个周末在 Mitchell Park 社区中心上课。完全免费。不需要自带乐器，也不需要任何基础。"],
    "Sign up to learn or to help": ["Apúntate para aprender o ayudar", "报名学习或来帮忙"],
    "See the schedule": ["Ver el horario", "查看课程表"],
    "Upcoming notifications": ["Próximas notificaciones", "即将到来的提醒"],
    "Your next reminders": ["Tus próximos recordatorios", "你的下一次提醒"],
    "Loading the next classes...": ["Cargando las próximas clases...", "正在加载接下来的课程..."],
    "Manage notifications": ["Gestionar notificaciones", "管理通知"],
    "Powered by": ["Con el apoyo de", "支持单位"],
    "Coming up": ["Próximamente", "近期安排"],
    "Here is": ["Esto es", "接下来"],
    "what is next.": ["lo que viene.", "的安排。"],
    "See the whole calendar": ["Ver el calendario completo", "查看完整日历"],
    "Why Toucan Music": ["Por qué Toucan Music", "为什么选择 Toucan Music"],
    "Nobody should miss out on music because of what it costs.": ["Nadie debería quedarse sin música por lo que cuesta.", "没有人应该因为费用而与音乐无缘。"],
    "Lessons are free. So are the instruments, and so is the concert at the end. The people teaching are students too, just a few years further along.": ["Las clases son gratis. También los instrumentos, y el concierto del final. Quienes enseñan también son estudiantes, solo unos años más adelante.", "课程免费，乐器免费，结业音乐会也免费。授课的人也是学生，只是比你早学几年。"],
    "Read our mission": ["Lee nuestra misión", "阅读我们的使命"],
    "Join Toucan Music": ["Únete a Toucan Music", "加入 Toucan Music"],
    "Photos from lessons": ["Fotos de las clases", "课堂照片"],
    "Previous photo": ["Foto anterior", "上一张照片"],
    "Next photo": ["Foto siguiente", "下一张照片"],

    // ---------------------------------------------------------- calendar
    "Calendar — Toucan Music": ["Calendario — Toucan Music", "日历 — Toucan Music"],
    "Classes & events": ["Clases y eventos", "课程与活动"],
    "Previous month": ["Mes anterior", "上个月"],
    "Next month": ["Mes siguiente", "下个月"],
    "Monthly calendar": ["Calendario mensual", "月历"],
    "Loading the schedule…": ["Cargando el horario…", "正在加载课程表…"],
    "All instruments": ["Todos los instrumentos", "所有乐器"],
    "Class": ["Clase", "课程"],
    "Event": ["Evento", "活动"],
    "class": ["clase", "课程"],
    "event": ["evento", "活动"],
    "Selected day": ["Día seleccionado", "所选日期"],
    "Past classes & events": ["Clases y eventos pasados", "过去的课程与活动"],
    "Add class": ["Añadir clase", "添加课程"],
    "Add event": ["Añadir evento", "添加活动"],
    "Timetable": ["Horario", "时间表"],
    "Pick a slot in your instrument's column.": ["Elige un turno en la columna de tu instrumento.", "在你的乐器所在列中选择一个时段。"],
    "Pick a slot in one of your instruments' columns.": ["Elige un turno en la columna de uno de tus instrumentos.", "在你任意一种乐器所在的列中选择一个时段。"],
    "Which instrument?": ["¿Qué instrumento?", "哪种乐器？"],
    "This class teaches more than one of your instruments. Which are you taking it for?": ["Esta clase enseña más de uno de tus instrumentos. ¿Con cuál la vas a tomar?", "这节课教授你学习的多种乐器。你要以哪种乐器报名？"],
    "See the timetable": ["Ver el horario", "查看时间表"],
    "See the other instruments": ["Ver los otros instrumentos", "查看其他乐器"],
    "See every slot": ["Ver todos los turnos", "查看所有时段"],
    "Just my slot": ["Solo mi turno", "只看我的时段"],
    "Sign in to join": ["Inicia sesión para apuntarte", "登录后报名"],
    "Sign in to take a slot": ["Inicia sesión para tomar un turno", "登录后选择时段"],
    "Join class": ["Apuntarme a la clase", "报名课程"],
    "Leave class": ["Dejar la clase", "退出课程"],
    "Enrolled": ["Inscrito", "已报名"],
    "Ended": ["Terminado", "已结束"],
    "Volunteer": ["Ser voluntario", "报名志愿"],
    "Withdraw": ["Retirarme", "取消志愿"],
    "Who signed up": ["Quién se apuntó", "报名名单"],
    "Change slot": ["Cambiar de turno", "更改时段"],
    "Change class": ["Cambiar de clase", "更改课程"],
    "Anyone can browse the schedule. Sign in to join a class or volunteer.": ["Cualquiera puede ver el horario. Inicia sesión para apuntarte a una clase o ser voluntario.", "所有人都可以浏览课程表。登录后可报名课程或志愿服务。"],
    "Choose an instrument in Settings to join classes.": ["Elige un instrumento en Ajustes para apuntarte a clases.", "请在设置中选择乐器后再报名课程。"],
    "You can sign up to volunteer for any event.": ["Puedes apuntarte como voluntario en cualquier evento.", "你可以为任何活动报名志愿服务。"],
    "You can add, edit, and delete anything here.": ["Aquí puedes añadir, editar y borrar lo que quieras.", "你可以在这里添加、编辑和删除任何内容。"],
    "Location to be announced": ["Lugar por anunciar", "地点待定"],
    "Pick another slot to move to.": ["Elige otro turno al que cambiarte.", "选择要换到的另一个时段。"],
    "Enrollment is closed.": ["Las inscripciones están cerradas.", "报名已截止。"],
    "This class has already started.": ["Esta clase ya ha empezado.", "这节课已经开始了。"],
    "Choose an instrument in Settings first.": ["Primero elige un instrumento en Ajustes.", "请先在设置中选择乐器。"],
    "No volunteer spots for this event.": ["Este evento no tiene plazas de voluntariado.", "此活动没有志愿者名额。"],

    // ---------------------------------------------------- settings drawer
    "Keep up with classes": ["Al día con las clases", "跟进课程"],
    "Log in to manage weekly email, class reminders, and text notifications.": ["Inicia sesión para gestionar el correo semanal, los recordatorios de clase y los mensajes de texto.", "登录后可管理每周邮件、课程提醒和短信通知。"],
    "Create an account": ["Crear una cuenta", "创建账户"],
    "Pick every instrument you are learning. You can join a class, and take a time slot, for any of them.": ["Marca todos los instrumentos que estás aprendiendo. Puedes apuntarte a una clase, y tomar un turno, con cualquiera de ellos.", "勾选你正在学习的所有乐器。你可以用其中任何一种报名课程和选择时段。"],
    "Instruments": ["Instrumentos", "乐器"],
    "Your instruments": ["Tus instrumentos", "你的乐器"],
    "Choose an instrument": ["Elige un instrumento", "选择乐器"],
    "You can add an instrument any time. To remove one, first leave or transfer any class you are enrolled in for it. Your enrollment will never be deleted automatically.": ["Puedes añadir un instrumento en cualquier momento. Para quitar uno, primero deja o cambia cualquier clase en la que estés inscrito con él. Tu inscripción nunca se borra sola.", "你可以随时添加乐器。要移除某个乐器，请先退出或更换你以该乐器报名的课程。你的报名不会被自动删除。"],
    "Notifications": ["Notificaciones", "通知"],
    "How we reach you about a class.": ["Cómo te avisamos de una clase.", "我们如何通知你课程信息。"],
    "Weekly schedule email": ["Correo semanal del horario", "每周课程表邮件"],
    "One email on Monday with the week ahead.": ["Un correo el lunes con la semana que viene.", "每周一发送一封邮件，预告本周安排。"],
    "Class reminders": ["Recordatorios de clase", "课程提醒"],
    "A nudge here and by email before class.": ["Un aviso aquí y por correo antes de la clase.", "上课前在此处和邮件中提醒你。"],
    "Text notifications": ["Mensajes de texto", "短信通知"],
    "A short text before class starts.": ["Un mensaje corto antes de que empiece la clase.", "上课前发送一条简短短信。"],
    "Mobile number": ["Número de móvil", "手机号码"],
    "Country calling code": ["Prefijo del país", "国家区号"],
    "Pick your country on the left rather than typing a code. Message and data rates may apply.": ["Elige tu país a la izquierda en vez de escribir el prefijo. Pueden aplicarse tarifas de mensajes y datos.", "请在左侧选择国家，而不是手动输入区号。可能会产生短信和流量费用。"],
    "Save your number": ["Guardar tu número", "保存号码"],
    "Save settings": ["Guardar ajustes", "保存设置"],
    "Site guide": ["Guía del sitio", "网站指南"],
    "Saving...": ["Guardando...", "正在保存..."],
    "Your settings are saved.": ["Tus ajustes se han guardado.", "你的设置已保存。"],
    "Your mobile number is saved.": ["Tu número de móvil se ha guardado.", "你的手机号码已保存。"],
    "Settings were not saved. Please try again.": ["Los ajustes no se guardaron. Inténtalo de nuevo.", "设置未能保存，请重试。"],
    "Choose at least one instrument before saving student settings.": ["Elige al menos un instrumento antes de guardar los ajustes de estudiante.", "保存学生设置前请至少选择一种乐器。"],

    // ------------------------------------------------------------- login
    "Log in — Toucan Music": ["Iniciar sesión — Toucan Music", "登录 — Toucan Music"],
    "Welcome back": ["Hola de nuevo", "欢迎回来"],
    "Log in for your classes, your volunteer spots, and your settings.": ["Inicia sesión para tus clases, tus plazas de voluntariado y tus ajustes.", "登录查看你的课程、志愿名额和设置。"],
    "Email (or admin name)": ["Correo electrónico (o nombre de administrador)", "电子邮箱（或管理员名称）"],
    "Forgotten your password?": ["¿Olvidaste tu contraseña?", "忘记密码？"],
    "First time here?": ["¿Primera vez aquí?", "第一次来？"],
    "Make an account": ["Crea una cuenta", "创建账户"],
    "as a student or a volunteer.": ["como estudiante o voluntario.", "，作为学生或志愿者。"],
    "Confirm this account": ["Confirma esta cuenta", "确认此账户"],
    "This account exists, but its email address is still awaiting confirmation.": ["Esta cuenta existe, pero su correo electrónico todavía no se ha confirmado.", "此账户已存在，但电子邮箱尚未确认。"],
    "Send confirmation email": ["Enviar correo de confirmación", "发送确认邮件"],
    "What do I do?": ["¿Qué hago?", "我该怎么做？"],

    // ------------------------------------------------------------ signup
    "Join us — Toucan Music": ["Únete — Toucan Music", "加入我们 — Toucan Music"],
    "Tell us who you are. That sets up what your calendar shows you.": ["Cuéntanos quién eres. Eso decide lo que te muestra tu calendario.", "告诉我们你是谁，这决定了日历向你显示的内容。"],
    "Choose your role": ["Elige tu rol", "选择你的身份"],
    "I'm a student": ["Soy estudiante", "我是学生"],
    "Take free piano, violin, or viola lessons and play at showcase nights.": ["Recibe clases gratuitas de piano, violín o viola y toca en las noches de muestra.", "免费学习钢琴、小提琴或中提琴，并在汇报演出之夜登台。"],
    "I'm a volunteer": ["Soy voluntario", "我是志愿者"],
    "Take a volunteer spot at a class or an event and see how many are still open.": ["Toma una plaza de voluntariado en una clase o un evento y mira cuántas quedan libres.", "在课程或活动中报名志愿服务，并查看剩余名额。"],
    "Select your instruments": ["Elige tus instrumentos", "选择你的乐器"],
    "Loading instruments…": ["Cargando instrumentos…", "正在加载乐器…"],
    "Instruments unavailable": ["Instrumentos no disponibles", "无法加载乐器"],
    "Pick every instrument you want to learn; one is enough to start. This sets which classes you can join. You can add or change instruments in Settings.": ["Marca todos los instrumentos que quieras aprender; con uno basta para empezar. Esto decide a qué clases puedes apuntarte. Puedes añadir o cambiar instrumentos en Ajustes.", "勾选你想学习的所有乐器，先选一种也可以。这决定了你可以报名哪些课程。你可以随时在设置中添加或更改乐器。"],
    "Full name": ["Nombre completo", "全名"],
    "We send the weekly schedule and class reminders here. Both can be switched off in Settings.": ["Aquí enviamos el horario semanal y los recordatorios de clase. Ambos se pueden desactivar en Ajustes.", "每周课程表和课程提醒会发送到这里。两者都可以在设置中关闭。"],
    "optional": ["opcional", "可选"],
    "Give us one and we will text you before class. Pick your country on the left rather than typing a code. You can remove it later in Settings.": ["Danos uno y te escribiremos antes de la clase. Elige tu país a la izquierda en vez de escribir el prefijo. Puedes quitarlo después en Ajustes.", "留下号码，上课前我们会给你发短信。请在左侧选择国家，而不是手动输入区号。之后可在设置中删除。"],
    "Create account": ["Crear cuenta", "创建账户"],
    "Already have an account?": ["¿Ya tienes una cuenta?", "已经有账户了？"],

    // ---------------------------------------------- password and email
    "Reset your password — Toucan Music": ["Restablecer tu contraseña — Toucan Music", "重置密码 — Toucan Music"],
    "Reset your password": ["Restablece tu contraseña", "重置密码"],
    "Give us the email on the account and we will send a link to set a new password.": ["Dinos el correo de la cuenta y te enviaremos un enlace para poner una contraseña nueva.", "输入账户的电子邮箱，我们会发送一个设置新密码的链接。"],
    "Check your email": ["Revisa tu correo", "查看你的邮箱"],
    "If that address has an account, a reset link is on its way. The link is good for one hour.": ["Si esa dirección tiene una cuenta, el enlace ya está en camino. Es válido durante una hora.", "如果该邮箱有账户，重置链接已在发送中。链接一小时内有效。"],
    "Send the reset link": ["Enviar el enlace", "发送重置链接"],
    "Remembered it?": ["¿La recordaste?", "想起来了？"],
    "Choose a new password — Toucan Music": ["Elige una contraseña nueva — Toucan Music", "选择新密码 — Toucan Music"],
    "Choose a new password": ["Elige una contraseña nueva", "选择新密码"],
    "Checking your reset link…": ["Comprobando tu enlace…", "正在检查你的重置链接…"],
    "New password": ["Contraseña nueva", "新密码"],
    "At least 8 characters.": ["Al menos 8 caracteres.", "至少 8 个字符。"],
    "Type it again": ["Escríbela otra vez", "再输入一次"],
    "Save the new password": ["Guardar la contraseña nueva", "保存新密码"],
    "Ask for a new link": ["Pide un enlace nuevo", "申请新链接"],
    ", or": [", o", "，或"],
    "go back to log in": ["vuelve a iniciar sesión", "返回登录"],
    "Confirm your email — Toucan Music": ["Confirma tu correo — Toucan Music", "确认邮箱 — Toucan Music"],
    "Your account is made. We sent a confirmation link to": ["Tu cuenta está creada. Enviamos un enlace de confirmación a", "账户已创建。我们已将确认链接发送至"],
    "the address you signed up with": ["la dirección con la que te registraste", "你注册时使用的邮箱"],
    ". Open it and you are in.": [". Ábrelo y ya estás dentro.", "。打开它即可完成。"],
    "Find the email from Toucan Music. Give it a minute to arrive.": ["Busca el correo de Toucan Music. Dale un minuto para llegar.", "找到来自 Toucan Music 的邮件，可能需要一分钟才能送达。"],
    "Click the link inside it.": ["Haz clic en el enlace que contiene.", "点击邮件中的链接。"],
    "That brings you back here to log in for the first time.": ["Eso te trae de vuelta aquí para iniciar sesión por primera vez.", "它会把你带回这里，完成首次登录。"],
    "Go to log in": ["Ir a iniciar sesión", "前往登录"],
    "Send it again": ["Enviarlo otra vez", "重新发送"],
    "Nothing in your inbox? Check the spam folder first. If the address was wrong,": ["¿No hay nada en tu bandeja? Mira primero en la carpeta de spam. Si la dirección estaba mal,", "收件箱里没有？先检查垃圾邮件文件夹。如果邮箱填错了，"],
    "sign up again": ["regístrate otra vez", "重新注册"],
    "with the right one.": ["con la correcta.", "，使用正确的邮箱。"],

    // ---------------------------------------------------------- mission
    "Our Mission - Toucan Music": ["Nuestra misión - Toucan Music", "我们的使命 - Toucan Music"],
    "About us - Toucan Music": ["Quiénes somos - Toucan Music", "关于我们 - Toucan Music"],
    "Our mission is": ["Nuestra misión es", "我们的使命是"],
    "music within reach.": ["música al alcance de todos.", "让音乐触手可及。"],
    "We remove the price and access barriers that keep children outside the music room.": ["Quitamos las barreras de precio y de acceso que dejan a los niños fuera del aula de música.", "我们消除让孩子被挡在音乐教室之外的费用和门槛。"],
    "Mission statement": ["Declaración de misión", "使命宣言"],
    "Every kid should get to play something.": ["Todos los niños deberían poder tocar algo.", "每个孩子都应该有机会演奏乐器。"],
    "Seven of us run this, and we are all Palo Alto teenagers. We teach piano, violin, and viola at Mitchell Park Community Center on weekends. Nobody pays for lessons and nobody pays to perform. We do not ask what a family earns, and we do not ask whether a kid has played before. Wanting to try is the whole requirement.": ["Esto lo llevamos siete personas, y todos somos adolescentes de Palo Alto. Enseñamos piano, violín y viola en el Mitchell Park Community Center los fines de semana. Nadie paga por las clases y nadie paga por tocar. No preguntamos cuánto gana una familia, ni si el niño ha tocado antes. Querer probar es el único requisito.", "我们七个人一起运营这个项目，全都是帕洛阿尔托的青少年。我们周末在 Mitchell Park 社区中心教授钢琴、小提琴和中提琴。上课不收费，演出也不收费。我们不问家庭收入，也不问孩子是否学过。想试一试就是全部的要求。"],
    "Free means free": ["Gratis significa gratis", "免费就是免费"],
    "No tuition, no recital fee, no instrument to rent.": ["Sin matrícula, sin cuota de recital, sin alquiler de instrumento.", "没有学费，没有演出费，不用租乐器。"],
    "You learn in a room with other kids": ["Aprendes en una sala con otros niños", "和其他孩子在同一间教室学习"],
    "Practising is easier when you are not doing it alone.": ["Practicar es más fácil cuando no lo haces solo.", "有人一起练习，坚持起来更容易。"],
    "Run by teenagers": ["Dirigido por adolescentes", "由青少年运营"],
    "Seven of us, plus the families and volunteers who turn up early to set out chairs.": ["Somos siete, más las familias y voluntarios que llegan temprano a colocar las sillas.", "我们七个人，加上早早到场摆椅子的家长和志愿者。"],
    "Come and play with us.": ["Ven a tocar con nosotros.", "来和我们一起演奏吧。"],
    "Sign up for a class, help out at an event, or just send us a question.": ["Apúntate a una clase, ayuda en un evento o simplemente mándanos una pregunta.", "报名课程、在活动中帮忙，或者只是给我们发个问题。"],
    "Contact us": ["Contáctanos", "联系我们"],
    "How Toucan Music works": ["Cómo funciona Toucan Music", "Toucan Music 如何运作"],

    // ------------------------------------------------------ guided tour
    "Next": ["Siguiente", "下一步"],
    "Back": ["Atrás", "上一步"],
    "Done": ["Listo", "完成"],
    "Here is how to find a class and sign up for it, step by step.": ["Así se encuentra una clase y se reserva, paso a paso.", "下面一步一步教你如何找到课程并报名。"],
    "Here is the quickest way to find classes, events, and the tools available to your account.": ["Esta es la forma más rápida de encontrar clases, eventos y las herramientas de tu cuenta.", "这是找到课程、活动和你账户可用工具的最快方式。"],
    "Your schedule": ["Tu horario", "你的日程"],
    "The calendar icon brings you back to classes and events from anywhere on the site.": ["El icono del calendario te lleva a las clases y eventos desde cualquier página del sitio.", "无论在网站的哪个页面，点击日历图标都能回到课程与活动。"],
    "Move between months": ["Cambia de mes", "切换月份"],
    "Use the arrows to browse upcoming and past schedules.": ["Usa las flechas para ver los horarios futuros y pasados.", "用箭头浏览未来和过去的安排。"],
    "1. Pick a day": ["1. Elige un día", "1. 选择日期"],
    "A day with a class shows its time and name. Press the day and it opens beside the calendar, or underneath on a phone.": ["Un día con clase muestra su hora y su nombre. Pulsa el día y se abre junto al calendario, o debajo en un móvil.", "有课的日期会显示课程时间和名称。点击该日期，课程会在日历旁边打开，手机上则显示在下方。"],
    "2. Open the class": ["2. Abre la clase", "2. 打开课程"],
    "Press a class to see its instrument, time and place. A class with one place for everyone has a Join class button. A class split into time slots shows its timetable underneath.": ["Pulsa una clase para ver su instrumento, hora y lugar. Una clase con una sola plaza para todos tiene el botón Apuntarme a la clase. Una clase dividida en turnos muestra su horario debajo.", "点击课程可查看乐器、时间和地点。整班报名的课程有一个“报名课程”按钮。按时段划分的课程会在下方显示时间表。"],
    "3. Pick your time": ["3. Elige tu hora", "3. 选择时段"],
    "The timetable shows the columns for your instruments. Press the slot you want. A full slot is greyed out. See the other instruments shows every column, and the button under it brings yours back.": ["El horario muestra las columnas de tus instrumentos. Pulsa el turno que quieras. Un turno lleno aparece en gris. Ver los otros instrumentos muestra todas las columnas, y el botón de debajo vuelve a las tuyas.", "时间表显示你的乐器所在的列。点击想要的时段，已满的时段显示为灰色。“查看其他乐器”显示所有列，下方的按钮则回到你的那几列。"],
    "4. You are booked": ["4. Ya tienes plaza", "4. 报名成功"],
    "A screen confirms your slot. Change slot moves you to another one, and Leave class gives the place back. We remind you before it starts.": ["Una pantalla confirma tu turno. Cambiar de turno te pasa a otro, y Dejar la clase devuelve la plaza. Te avisamos antes de que empiece.", "会有一个页面确认你的时段。“更改时段”可换到另一个时段，“退出课程”会把名额让出来。上课前我们会提醒你。"],
    "Classes and events": ["Clases y eventos", "课程与活动"],
    "The legend shows which calendar items are recurring classes and which are special events.": ["La leyenda muestra qué elementos del calendario son clases periódicas y cuáles son eventos especiales.", "图例说明日历上哪些是定期课程，哪些是特别活动。"],
    "Preferences and help": ["Preferencias y ayuda", "偏好与帮助"],
    "The settings drawer controls your instruments, weekly email, class reminders, text notifications and language. You can also replay this guide there.": ["El panel de ajustes controla tus instrumentos, el correo semanal, los recordatorios de clase, los mensajes de texto y el idioma. Ahí también puedes repetir esta guía.", "设置面板可以管理你的乐器、每周邮件、课程提醒、短信通知和语言。你也可以在那里重新播放本指南。"],
    "The settings drawer controls weekly email, class reminders, text notifications and language. You can also replay this guide there.": ["El panel de ajustes controla el correo semanal, los recordatorios de clase, los mensajes de texto y el idioma. Ahí también puedes repetir esta guía.", "设置面板可以管理每周邮件、课程提醒、短信通知和语言。你也可以在那里重新播放本指南。"],
    "Open a class to see volunteer availability and claim a spot.": ["Abre una clase para ver las plazas de voluntariado y tomar una.", "打开课程查看志愿者名额并认领一个。"],
    "Open an item to review it. Admin controls also let you create and edit events.": ["Abre un elemento para revisarlo. Los controles de administración también permiten crear y editar eventos.", "打开一个条目进行查看。管理员控件还可以创建和编辑活动。"],
    "Open a calendar item": ["Abre un elemento del calendario", "打开日历条目"],
    "Violin": ["Violín", "小提琴"],
    "2 places open": ["2 plazas libres", "剩余 2 个名额"],
    "Your slot": ["Tu turno", "你的时段"],
    "Full": ["Lleno", "已满"],
  };

  // Tags with nothing worth translating, or that must not be touched.
  const SKIP = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "SVG", "NOSCRIPT"]);
  const ATTRIBUTES = ["placeholder", "aria-label", "title", "data-tooltip", "alt"];

  let current = "en";
  // What was written where, so a change of language can start again from
  // the English. `out` is our own last write: while the node still says
  // that, the English on record is the source; once a script has written
  // something else, that is the new source.
  const texts = new WeakMap();      // Text -> { en, out }
  const attributes = new WeakMap(); // Element -> { name: { en, out } }

  function lookup(english) {
    if (current === "en") return null;
    const row = STRINGS[english];
    return row ? row[COLUMN[current]] || null : null;
  }

  // The translation keeps the whitespace round the sentence, which is how
  // markup separates "We teach" from the phrase after it.
  function translate(source) {
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(source);
    const out = lookup(match[2].replace(/\s+/g, " "));
    return out === null ? null : match[1] + out + match[3];
  }

  function translateText(node) {
    const record = texts.get(node);
    const source = record && node.data === record.out ? record.en : node.data;
    const out = translate(source);
    const next = out === null ? source : out;
    if (node.data !== next) node.data = next;
    if (out === null) texts.delete(node);
    else texts.set(node, { en: source, out: next });
  }

  function translateAttribute(el, name) {
    if (!el.hasAttribute(name)) return;
    const records = attributes.get(el) || {};
    const record = records[name];
    const value = el.getAttribute(name);
    const source = record && value === record.out ? record.en : value;
    const out = translate(source);
    const next = out === null ? source : out;
    if (value !== next) el.setAttribute(name, next);
    if (out === null) delete records[name];
    else records[name] = { en: source, out: next };
    attributes.set(el, records);
  }

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) { translateText(node); return; }
    if (node.nodeType !== Node.ELEMENT_NODE || SKIP.has(node.tagName.toUpperCase())) return;
    ATTRIBUTES.forEach((name) => translateAttribute(node, name));
    for (let child = node.firstChild; child; child = child.nextSibling) walk(child);
  }

  function set(code, { silent = false } = {}) {
    const language = LANGUAGES.find((row) => row.code === code) || LANGUAGES[0];
    current = language.code;
    try { localStorage.setItem(KEY, current); } catch (error) { /* private mode */ }
    document.documentElement.lang = language.tag;
    walk(document.documentElement);
    if (!silent) window.dispatchEvent(new CustomEvent("toucan:language-changed", { detail: { language: current } }));
  }

  function stored() {
    try { return localStorage.getItem(KEY); } catch (error) { return null; }
  }

  // First visit: the browser's own language, if it is one we have.
  function guess() {
    const wanted = (navigator.languages || [navigator.language || "en"]).map((tag) => tag.toLowerCase());
    for (const tag of wanted) {
      const hit = LANGUAGES.find((row) => tag === row.code || tag.startsWith(`${row.code}-`));
      if (hit) return hit.code;
    }
    return "en";
  }

  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "childList") record.addedNodes.forEach(walk);
      else if (record.type === "characterData") translateText(record.target);
      else if (record.type === "attributes" && record.target.nodeType === Node.ELEMENT_NODE) {
        translateAttribute(record.target, record.attributeName);
      }
    }
  }).observe(document.documentElement, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ATTRIBUTES,
  });

  window.ToucanI18n = {
    languages: LANGUAGES.map((row) => ({ ...row })),
    get current() { return current; },
    set,
    // The sentence in the current language, for a script that builds text
    // rather than writing it into the page.
    t: (english) => lookup(english) ?? english,
  };

  set(stored() || guess(), { silent: true });
})();
