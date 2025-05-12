import { Markup, session, Telegraf } from "telegraf";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import axios from "axios";
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN || "YOUR_BOT_TOKEN";
const MONGO_URI = process.env.MONGO_URI || "YOUR_MONGO_URI";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "YOUR_ADMIN_CHAT_ID";

async function main() {
  // ==== MONGO CLIENT ====
  const mongoClient = new MongoClient(MONGO_URI);

  try {
    await mongoClient.connect();
    console.log("✅ Connected to MongoDB");

    const db = mongoClient.db("appointment_db");
    const appointments = db.collection("appointments");

    // ==== BOT ====
    const bot = new Telegraf(BOT_TOKEN);

    bot.use(session());

    const adminChatId = ADMIN_CHAT_ID;

    // ==== HELPER FUNCTIONS ====
    const mainMenuKeyboard = Markup.keyboard([
      ["📅 Yangi uchrashuv"],
      ["🗓 Uchrashuvlarim"],
      ["📞 Bog'lanish", "❓ Yordam"],
    ]).resize();

    const returnToMainMenu = (ctx, message) => {
      ctx.session = { step: "main_menu" };
      return ctx.reply(message, mainMenuKeyboard);
    };

    const ensureSession = (ctx) => {
      if (!ctx.session) ctx.session = {};
      return ctx.session;
    };

    const formatAppointment = (app, index) => {
      let result = `${index + 1}. 👤 ${app.fullName}\n` + `📞 ${app.phone}\n`;

      if (app.location) {
        result += `📍 ${app.address}\n`;
        if (app.fullAddress) {
          result += `🏠 ${app.fullAddress}\n`;
        }
      } else {
        result += `📍 ${app.address}\n`;
      }

      result +=
        `📅 ${app.weekday}\n` +
        `🕒 ${app.createdAt.toLocaleString("uz-UZ")}\n\n`;

      return result;
    };

    const getAddressFromCoordinates = async (latitude, longitude) => {
      try {
        const response = await axios.get(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
          {
            headers: {
              "User-Agent": "TelegramAppointmentBot/1.0",
            },
          }
        );

        if (response.data && response.data.display_name) {
          return {
            shortAddress: response.data.name || "Unknown location",
            fullAddress: response.data.display_name,
          };
        }
        return { shortAddress: "Unknown location", fullAddress: null };
      } catch (error) {
        console.error("Error getting address:", error);
        return { shortAddress: "Unknown location", fullAddress: null };
      }
    };

    const startNewAppointment = (ctx) => {
      const session = ensureSession(ctx);

      const firstName = ctx.from?.first_name || "";
      const lastName = ctx.from?.last_name || "";
      session.fullName = `${firstName} ${lastName}`.trim();
      session.step = "confirm_name";

      return ctx.reply(
        `Ismingiz: ${session.fullName}\n\nTo'g'rimi?`,
        Markup.keyboard([["✅ Ha", "❌ Yo'q"]]).resize()
      );
    };

    const getUserAppointments = async (ctx) => {
      ensureSession(ctx).step = "main_menu";

      try {
        const userAppointments = await appointments
          .find({ chatId: ctx.chat.id })
          .toArray();

        if (userAppointments.length === 0) {
          return ctx.reply(
            "Sizda hozircha uchrashuvlar yo'q.",
            mainMenuKeyboard
          );
        } else {
          let response = "📅 Sizning uchrashuvlaringiz:\n\n";
          userAppointments.forEach((app, index) => {
            response += formatAppointment(app, index);
          });
          return ctx.reply(response, mainMenuKeyboard);
        }
      } catch (error) {
        console.error("Error fetching appointments:", error);
        return ctx.reply("❌ Uchrashuvlarni olishda xatolik yuz berdi.");
      }
    };

    const helpText =
      "ℹ️ Botdan foydalanish bo'yicha yordam:\n\n" +
      "/start — Botni ishga tushirish\n" +
      "/new — Yangi uchrashuv yaratish\n" +
      "/appointments — Uchrashuvlarimni ko'rish\n" +
      "/cancel — Joriy amalni bekor qilish\n" +
      "/contact — Bog'lanish ma'lumotlari\n" +
      "/help — Ushbu yordam xabarini ko'rsatish\n\n" +
      "Shuningdek, quyidagi tugmalardan foydalanishingiz mumkin:\n" +
      "📅 Yangi uchrashuv — Yangi uchrashuv belgilash\n" +
      "🗓 Uchrashuvlarim — Sizning uchrashuvlaringizni ko'rish\n" +
      "📞 Bog'lanish — Admin bilan bog'lanish\n" +
      "❓ Yordam — Yordam olish";

    const contactInfo = "📞 Biz bilan bog'lanish uchun: +998-93-804-30-90";

    // ==== BOT COMMANDS ====
    bot.telegram.setMyCommands([
      { command: "start", description: "Botni ishga tushirish" },
      { command: "help", description: "Yordam olish" },
      { command: "appointments", description: "Uchrashuvlarimni ko'rish" },
      { command: "new", description: "Yangi uchrashuv yaratish" },
      { command: "cancel", description: "Joriy amalni bekor qilish" },
      { command: "contact", description: "Bog'lanish ma'lumotlari" },
    ]);

    // ==== START ====
    bot.start((ctx) => {
      return returnToMainMenu(
        ctx,
        "👋 Salom, botimizga xush kelibsiz!\n\nQuyidagi menyudan birini tanlang:"
      );
    });

    // ==== HELP COMMAND & BUTTON ====
    bot.command("help", (ctx) => returnToMainMenu(ctx, helpText));
    bot.hears("❓ Yordam", (ctx) => returnToMainMenu(ctx, helpText));

    // ==== NEW APPOINTMENT COMMAND & BUTTON ====
    bot.command("new", startNewAppointment);
    bot.hears("📅 Yangi uchrashuv", startNewAppointment);

    // ==== APPOINTMENTS COMMAND & BUTTON ====
    bot.command("appointments", getUserAppointments);
    bot.hears("🗓 Uchrashuvlarim", getUserAppointments);

    // ==== CANCEL COMMAND ====
    bot.command("cancel", (ctx) =>
      returnToMainMenu(ctx, "❌ Joriy amal bekor qilindi.")
    );

    // ==== CONTACT COMMAND & BUTTON ====
    bot.command("contact", (ctx) => returnToMainMenu(ctx, contactInfo));
    bot.hears("📞 Bog'lanish", (ctx) => returnToMainMenu(ctx, contactInfo));

    // ==== ISMNI QAYTA KIRITISH ====
    bot.hears("❌ Yo'q", (ctx) => {
      const session = ensureSession(ctx);

      if (session.step === "confirm_name") {
        session.step = "ask_name";
        ctx.reply("Iltimos, to'liq ismingizni kiriting:");
      }
    });

    // ==== LOCATION HANDLER ====
    bot.on("location", async (ctx) => {
      const session = ensureSession(ctx);

      if (session.step === "ask_address") {
        const { latitude, longitude } = ctx.message.location;

        // Save location data
        session.location = { latitude, longitude };

        // Get address from coordinates
        const addressInfo = await getAddressFromCoordinates(
          latitude,
          longitude
        );
        session.address = addressInfo.shortAddress;
        session.fullAddress = addressInfo.fullAddress;

        // Move to next step
        session.step = "ask_weekday";

        return ctx.reply(
          `📍 Joylashuv qabul qilindi: ${
            addressInfo.fullAddress || addressInfo.shortAddress
          }\n\nEndi qaysi kunga yozilmoqchisiz?`,
          Markup.keyboard([
            ["Dushanba", "Seshanba"],
            ["Chorshanba", "Payshanba"],
            ["Juma", "Shanba", "Yakshanba"],
          ]).resize()
        );
      }
    });

    // ==== MATNLI XABARLAR ====
    bot.on("text", async (ctx) => {
      if (ctx.message.text.startsWith("/")) {
        return;
      }

      const session = ensureSession(ctx);

      if (ctx.message.text === "❌ Bekor qilish") {
        return returnToMainMenu(ctx, "❌ Uchrashuv bekor qilindi.");
      }

      if (
        [
          "📅 Yangi uchrashuv",
          "🗓 Uchrashuvlarim",
          "📞 Bog'lanish",
          "❓ Yordam",
        ].includes(ctx.message.text)
      ) {
        return;
      }

      const weekdays = [
        "Dushanba",
        "Seshanba",
        "Chorshanba",
        "Payshanba",
        "Juma",
        "Shanba",
        "Yakshanba",
      ];

      if (
        weekdays.includes(ctx.message.text) &&
        session.step === "ask_weekday"
      ) {
        session.weekday = ctx.message.text;
        session.step = "confirm_appointment";

        let appointmentDetails =
          `✅ Uchrashuv ma'lumotlari:\n\n` +
          `👤 Ism: ${session.fullName}\n` +
          `📞 Tel: ${session.phone}\n`;

        if (session.location) {
          appointmentDetails += `📍 Joylashuv: ${session.address}\n`;
          if (session.fullAddress) {
            appointmentDetails += `🏠 To'liq manzil: ${session.fullAddress}\n`;
          }
        } else {
          appointmentDetails += `📍 Manzil: ${session.address}\n`;
        }

        appointmentDetails +=
          `📅 Kuni: ${session.weekday}\n\n` + `Barchasi to'g'rimi?`;

        return ctx.reply(
          appointmentDetails,
          Markup.keyboard([["✅ Ha", "❌ Bekor qilish"]]).resize()
        );
      }

      if (
        ctx.message.text === "✅ Ha" &&
        session.step === "confirm_appointment"
      ) {
        try {
          const appointment = {
            fullName: session.fullName,
            phone: session.phone,
            address: session.address,
            weekday: session.weekday,
            chatId: ctx.chat.id,
            createdAt: new Date(),
          };

          if (session.location) {
            appointment.location = session.location;
            appointment.fullAddress = session.fullAddress;
          }

          await appointments.insertOne(appointment);

          if (adminChatId) {
            let adminMessage =
              `🔔 Yangi uchrashuv:\n\n` +
              `👤 Ism: ${appointment.fullName}\n` +
              `📞 Tel: ${appointment.phone}\n`;

            if (appointment.location) {
              adminMessage += `📍 Joylashuv: ${appointment.address}\n`;
              if (appointment.fullAddress) {
                adminMessage += `🏠 To'liq manzil: ${appointment.fullAddress}\n`;
              }

              await bot.telegram.sendLocation(
                adminChatId,
                appointment.location.latitude,
                appointment.location.longitude
              );
            } else {
              adminMessage += `📍 Manzil: ${appointment.address}\n`;
            }

            adminMessage +=
              `📅 Kuni: ${appointment.weekday}\n` +
              `🆔 Chat ID: ${appointment.chatId}`;

            await bot.telegram.sendMessage(adminChatId, adminMessage);
          }

          return returnToMainMenu(
            ctx,
            "✅ Uchrashuv muvaffaqiyatli saqlandi! Tez orada siz bilan bog'lanamiz."
          );
        } catch (error) {
          console.error("Error saving appointment:", error);
          return ctx.reply(
            "❌ Xatolik yuz berdi, iltimos qaytadan urinib ko'ring."
          );
        }
      }

      if (ctx.message.text === "✅ Ha" && session.step === "confirm_name") {
        session.step = "ask_phone";

        return ctx.reply(
          "Ajoyib! Endi telefon raqamingizni yuboring.",
          Markup.keyboard([
            Markup.button.contactRequest("Telefon raqamini jo'natish 📞"),
          ]).resize()
        );
      }

      if (session.step === "ask_name") {
        session.fullName = ctx.message.text.trim();
        session.step = "ask_phone";

        return ctx.reply(
          `Rahmat, ${session.fullName}. Endi telefon raqamingizni yuboring.`,
          Markup.keyboard([
            Markup.button.contactRequest("Telefon raqamini jo'natish 📞"),
          ]).resize()
        );
      } else if (session.step === "ask_address") {
        // If user types address instead of sending location
        session.address = ctx.message.text.trim();
        session.step = "ask_weekday";

        return ctx.reply(
          "📅 Qaysi kunga yozilmoqchisiz?",
          Markup.keyboard([
            ["Dushanba", "Seshanba"],
            ["Chorshanba", "Payshanba"],
            ["Juma", "Shanba", "Yakshanba"],
          ]).resize()
        );
      }
    });

    // ==== TELEFON QABUL QILISH ====
    bot.on("contact", (ctx) => {
      const session = ensureSession(ctx);

      if (session.step === "ask_phone") {
        session.phone = ctx.message.contact.phone_number;
        session.step = "ask_address";

        return ctx.reply(
          "📍 Endi uchrashuv bo'lib o'tadigan manzilni kiriting yoki joylashuvingizni yuboring:",
          Markup.keyboard([
            [Markup.button.locationRequest("📍 Joylashuvni yuborish")],
            ["❌ Bekor qilish"],
          ]).resize()
        );
      }
    });

    // ==== XATOLIKLARNI BOSHQARISH ====
    bot.catch((err, ctx) => {
      console.error(`❌ Xato yuz berdi:`, err);
      ctx.reply(
        "❌ Xatolik yuz berdi, iltimos qaytadan urinib ko'ring.",
        mainMenuKeyboard
      );
    });

    // ==== BOTNI ISHGA TUSHIRISH ====
    await bot.launch();
    console.log("✅ Bot started");

    process.once("SIGINT", () => {
      bot.stop("SIGINT");
      mongoClient.close();
    });
    process.once("SIGTERM", () => {
      bot.stop("SIGTERM");
      mongoClient.close();
    });
  } catch (error) {
    console.error("❌ Error in main function:", error);
  }
}

main().catch(console.error);

console.log("Bot script is running...");
