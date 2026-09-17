// ============================================================
// Tutte le letture/scritture verso Supabase
// ============================================================

async function saveDiet(userId, { title, filename, rawText, days }) {
  // Disattiva le diete precedenti
  await window.sb.from("diets").update({ is_active: false }).eq("user_id", userId);

  const { data: diet, error: dietErr } = await window.sb
    .from("diets")
    .insert({
      user_id: userId,
      title: title || "Piano alimentare",
      source_filename: filename || null,
      raw_text: rawText || null,
      is_active: true,
    })
    .select()
    .single();
  if (dietErr) throw dietErr;

  for (const day of days) {
    const { data: dayRow, error: dayErr } = await window.sb
      .from("diet_days")
      .insert({
        diet_id: diet.id,
        day_index: day.dayIndex,
        day_label: day.dayLabel,
      })
      .select()
      .single();
    if (dayErr) throw dayErr;

    const mealsPayload = day.meals.map((m, idx) => ({
      diet_day_id: dayRow.id,
      meal_type: m.mealType,
      items: m.items,
      sort_order: idx,
    }));
    if (mealsPayload.length > 0) {
      const { error: mealErr } = await window.sb.from("diet_meals").insert(mealsPayload);
      if (mealErr) throw mealErr;
    }
  }

  return diet;
}

async function getActiveDiet(userId) {
  const { data: diet, error } = await window.sb
    .from("diets")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!diet) return null;

  const { data: dayRows, error: dayErr } = await window.sb
    .from("diet_days")
    .select("*, diet_meals(*)")
    .eq("diet_id", diet.id)
    .order("day_index", { ascending: true });
  if (dayErr) throw dayErr;

  dayRows.forEach((d) => d.diet_meals.sort((a, b) => a.sort_order - b.sort_order));

  return { ...diet, days: dayRows };
}

async function getMealLogsForDate(userId, dateStr) {
  const { data, error } = await window.sb
    .from("meal_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("log_date", dateStr);
  if (error) throw error;
  return data;
}

async function toggleMealLog(userId, dietMealId, dateStr, completed) {
  const { error } = await window.sb.from("meal_logs").upsert(
    {
      user_id: userId,
      diet_meal_id: dietMealId,
      log_date: dateStr,
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    },
    { onConflict: "diet_meal_id,log_date" }
  );
  if (error) throw error;
}

async function getWeekLogs(userId, startDateStr, endDateStr) {
  const { data, error } = await window.sb
    .from("meal_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("log_date", startDateStr)
    .lte("log_date", endDateStr);
  if (error) throw error;
  return data;
}

async function addWeightLog(userId, dateStr, weightKg, note) {
  const { error } = await window.sb.from("weight_logs").upsert(
    { user_id: userId, log_date: dateStr, weight_kg: weightKg, note: note || null },
    { onConflict: "user_id,log_date" }
  );
  if (error) throw error;
}

async function getWeightLogs(userId) {
  const { data, error } = await window.sb
    .from("weight_logs")
    .select("*")
    .eq("user_id", userId)
    .order("log_date", { ascending: true });
  if (error) throw error;
  return data;
}

window.DietStore = {
  saveDiet,
  getActiveDiet,
  getMealLogsForDate,
  toggleMealLog,
  getWeekLogs,
  addWeightLog,
  getWeightLogs,
};
