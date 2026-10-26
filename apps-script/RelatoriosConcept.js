// ══════════════════════════════════════════════════════════════════════════════
// ESCOLA CONCEPT, Auditoria de Espaços
// Relatórios na identidade Concept (v6.0)
//
//   - PDF diário redesenhado (mesmos dados do "Relatório Diário")
//   - Relatório semanal de recomendações (sexta 16h, salvo no Drive)
//
// Regras de segurança:
//   - Só LÊ a aba "Auditorias". Nunca escreve nela.
//   - Não cria abas. O semanal é montado em memória e vira PDF.
//   - Nunca apaga arquivos no Drive (nome repetido ganha sufixo _v2, _v3…).
//
// Estilos e logo: AssetsConcept.js
// ══════════════════════════════════════════════════════════════════════════════

const WEEKLY_REPORT_EMAIL = "robson.lopes@conceptedu.com.br";
const WEEKLY_REPORT_FOLDER = "Auditoria Espaços — Relatórios semanais";
const OKR_TARGET = 3.5;
const CONCEPT_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@300;500;700&family=Poppins:wght@300;400;600;700;800&display=swap";

const PT_WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const PT_MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const PT_MONTH_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// ══════════════════════════════════════════════════════════════════════════════
// ENTRADAS (Apps Script)
// ══════════════════════════════════════════════════════════════════════════════

// PDF diário no formato Concept. Usado por exportDailyContractorReportPdf.
function buildDailyConceptPdf_(dateString) {
  const rows = loadAuditRows_();
  const data = computeDaily_(rows, dateString);
  const html = renderDailyHtml_(data);
  return htmlToPdf_(html, "Relatorio_Diario_Facilities_Campus_SP_" + dateString + ".pdf");
}

// Disparado pelo gatilho de sexta 16h. Cobre sexta passada até ontem (quinta).
function sendWeeklyRecommendationsReport() {
  const today = getTodayDateString();
  const to = addDays_(today, -1);
  const from = addDays_(to, -6);
  return buildAndSendWeeklyReport_(from, to, WEEKLY_REPORT_EMAIL);
}

function buildAndSendWeeklyReport_(from, to, recipient) {
  const result = buildWeeklyReportPdf_(from, to);
  const file = saveToReportFolder_(result.pdfBlob);

  if (recipient) {
    MailApp.sendEmail({
      to: recipient,
      subject:
        "Recomendações da semana · Limpeza · Campus São Paulo · " +
        formatRangeShort_(from, to),
      body: buildWeeklyEmailBody_(result.data, file.getUrl()),
      attachments: [result.pdfBlob],
    });
  }

  return { ok: true, from, to, sent_to: recipient || "", file_url: file.getUrl(), file_id: file.getId() };
}

function buildWeeklyReportPdf_(from, to) {
  const rows = loadAuditRows_();
  const data = computeWeekly_(rows, from, to);
  const html = renderWeeklyHtml_(data);
  const name = "Recomendacoes_Semana_" + from + "_a_" + to + ".pdf";
  return { data, pdfBlob: htmlToPdf_(html, name) };
}

function buildWeeklyEmailBody_(d, fileUrl) {
  let body =
    "Olá,\n\n" +
    "Segue em anexo o relatório semanal de recomendações da limpeza (" +
    formatRangeLong_(d.from, d.to) +
    ").\n\n" +
    "Resumo:\n" +
    "- Nota média da semana: " + fmt_(d.avg) + " (meta OKR " + fmt_(OKR_TARGET) + ")\n" +
    "- Áreas abaixo de 3,0 em todos os dias auditados: " + d.chronic.length + "\n" +
    "- Registros críticos (< 2,0): " + d.criticalCount + "\n\n";

  if (d.actions.length) {
    body += "Prioridades para a próxima semana:\n";
    d.actions.slice(0, 3).forEach((a, i) => {
      body += i + 1 + ". " + a.acao + " (" + a.escopo + ")\n";
    });
    body += "\n";
  }

  body += "O PDF também fica salvo no Drive: " + fileUrl + "\n\nAtenciosamente,\nEscola Concept";
  return body;
}

function createWeeklyRecommendationsTrigger() {
  const functionName = "sendWeeklyRecommendationsReport";
  const exists = ScriptApp.getProjectTriggers().some(
    (t) => t.getHandlerFunction() === functionName
  );

  if (exists) return { ok: true, message: "Gatilho semanal já existe." };

  ScriptApp.newTrigger(functionName)
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(16)
    .nearMinute(0)
    .inTimezone("America/Sao_Paulo")
    .create();

  return { ok: true, message: "Gatilho semanal criado para sexta, perto das 16:00." };
}

// Prévias: só salvam o PDF na pasta do Drive. Não enviam e-mail.
function previewDailyConcept(dateString) {
  const pdf = buildDailyConceptPdf_(normalizeReportDate(dateString));
  pdf.setName("PREVIA_" + pdf.getName());
  return saveToReportFolder_(pdf);
}

function previewWeekly(from, to) {
  const result = buildWeeklyReportPdf_(from, to);
  result.pdfBlob.setName("PREVIA_" + result.pdfBlob.getName());
  return saveToReportFolder_(result.pdfBlob);
}

// ══════════════════════════════════════════════════════════════════════════════
// LEITURA DA PLANILHA (somente leitura)
// ══════════════════════════════════════════════════════════════════════════════

function loadAuditRows_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return [];

  const range = sheet.getDataRange();
  const values = range.getValues();
  const formulas = range.getFormulas();
  if (values.length < 2) return [];

  const headers = values[0].map((h) => String(h || "").trim());
  const col = (name) => headers.indexOf(name);
  const index = buildReportIndexMap(headers);

  const raw = values.slice(1).map((row, i) => {
    const item = { values: row, formulas: formulas[i + 1] || [] };
    const get = (name) => (col(name) >= 0 ? row[col(name)] : "");
    return {
      row_key: String(get("row_key") || ""),
      date: normalizeSheetDateValue(get("date")),
      slot_id: String(get("slot_id") || ""),
      slot_label: String(get("slot_label") || ""),
      auditor: String(get("auditor") || ""),
      area_id: String(get("area_id") || ""),
      area_label: String(get("area_label") || ""),
      area_score: get("area_score"),
      notes: String(get("notes") || get("note") || ""),
      has_photo: hasAnyReportPhoto(item, index),
      updated_at: String(get("updated_at") || ""),
      audit_status: String(get("audit_status") || ""),
      save_type: String(get("save_type") || ""),
      item_scores: String(get("item_scores") || ""),
    };
  });

  return normalizeAuditRows_(raw);
}

// ══════════════════════════════════════════════════════════════════════════════
// NÚCLEO DE CÁLCULO (puro: não usa serviços do Google)
// ══════════════════════════════════════════════════════════════════════════════

// Mantém só registros concluídos, remove duplicados por row_key (fica o mais
// recente) e converte nota e itens.
function normalizeAuditRows_(raw) {
  const byKey = {};

  raw.forEach((r) => {
    const done = r.audit_status === "completed" || r.save_type === "final_completion";
    const score = parseFloat(String(r.area_score).replace(",", "."));
    if (!done || isNaN(score) || !r.date) return;

    const key = r.row_key || r.date + "|" + r.slot_id + "|" + r.area_id;
    const prev = byKey[key];
    if (prev && String(prev.updated_at) > String(r.updated_at)) return;

    let items = [];
    if (r.item_scores) {
      try {
        items = JSON.parse(r.item_scores).filter((it) => it && it.item && it.score !== null && it.score !== undefined);
      } catch (e) {
        items = [];
      }
    }

    byKey[key] = {
      date: r.date,
      slot_id: String(r.slot_id),
      slot_label: r.slot_label,
      auditor: r.auditor,
      area_id: r.area_id,
      area_label: r.area_label,
      score: score,
      notes: String(r.notes || "").trim(),
      has_photo: !!r.has_photo,
      updated_at: r.updated_at,
      items: items,
    };
  });

  return Object.keys(byKey).map((k) => byKey[k]);
}

function computeDaily_(rows, date) {
  const day = rows.filter((r) => r.date === date);
  const prevDate = previousAuditDate_(rows, date);
  const prev = rows.filter((r) => r.date === prevDate);

  const areas = groupBy_(day, (r) => r.area_id);
  const monday = mondayOf_(date);

  const perArea = Object.keys(areas).map((id) => {
    const list = areas[id].slice().sort((a, b) => slotOrder_(a) - slotOrder_(b));
    const avg = mean_(list.map((r) => r.score));

    const weekDates = unique_(rows.filter((r) => r.area_id === id && r.date >= monday && r.date <= date).map((r) => r.date));
    const daysBelow = weekDates.filter((dt) => mean_(rows.filter((r) => r.area_id === id && r.date === dt).map((r) => r.score)) < 3).length;

    const rounds = list.map((r) => r.slot_label);
    let roundsText = rounds.length >= 4 ? "Todas as " + rounds.length + " rodadas" : joinPt_(rounds.map((s, i) => (i ? s.toLowerCase() : s)));

    const notes = [];
    if (daysBelow >= 2) notes.push(daysBelow + "º dia abaixo de 3,0 nesta semana");
    if (list.length >= 2 && list[list.length - 1].score < list[0].score) notes.push("piorou ao longo do dia");

    const failed = worstItems_(list, 3);

    return { id, label: list[0].area_label, avg, roundsText, notes, failed };
  });

  const priorities = perArea.filter((a) => a.avg < 3).sort((a, b) => a.avg - b.avg || a.label.localeCompare(b.label, "pt-BR")).slice(0, 4);

  const sorted = day.slice().sort((a, b) => a.score - b.score || a.area_label.localeCompare(b.area_label, "pt-BR"));
  const toFix = sorted.filter((r) => r.score < 4);
  const ok = sorted.filter((r) => r.score >= 4);

  const photos = day.filter((r) => r.has_photo).length;
  const notesCount = day.filter((r) => r.notes).length;

  let warning = "";
  if (day.length && photos === 0 && notesCount === 0) {
    warning = "<b>Nenhuma foto ou observação registrada hoje.</b> Sem evidência, o fornecedor não tem como saber o que corrigir.";
  } else if (day.length && photos === 0) {
    warning = "<b>Nenhuma foto registrada hoje.</b> As observações ajudam, mas a foto mostra ao fornecedor exatamente o que corrigir.";
  }

  return {
    date,
    prevDate,
    count: day.length,
    rounds: unique_(day.map((r) => r.slot_id)).length,
    areas: Object.keys(areas).length,
    avg: day.length ? mean_(day.map((r) => r.score)) : null,
    prevAvg: prev.length ? mean_(prev.map((r) => r.score)) : null,
    below3: day.filter((r) => r.score < 3).length,
    critical: day.filter((r) => r.score < 2).length,
    prevCritical: prev.filter((r) => r.score < 2).length,
    photos,
    warning,
    priorities,
    toFix,
    ok,
    hasItemScores: day.some((r) => r.items.length),
  };
}

function computeWeekly_(rows, from, to) {
  const cur = rows.filter((r) => r.date >= from && r.date <= to);
  const prevFrom = addDays_(from, -7);
  const prevTo = addDays_(to, -7);
  const prev = rows.filter((r) => r.date >= prevFrom && r.date <= prevTo);

  const dates = unique_(cur.map((r) => r.date)).sort();
  const days = dates.map((dt) => {
    const list = cur.filter((r) => r.date === dt);
    return { date: dt, avg: mean_(list.map((r) => r.score)), photos: list.filter((r) => r.has_photo).length, count: list.length };
  });

  const areaStats = statsByArea_(cur, dates);
  const prevAreaStats = statsByArea_(prev, unique_(prev.map((r) => r.date)).sort());
  const prevById = indexBy_(prevAreaStats, (a) => a.id);
  const hasPrev = prev.length > 0;

  // Tendência: contra a semana anterior; sem semana anterior, primeiro × último dia.
  areaStats.forEach((a) => {
    if (hasPrev && prevById[a.id]) {
      a.before = prevById[a.id].avg;
      a.after = a.avg;
    } else if (a.dayAvgs.length >= 2) {
      a.before = a.dayAvgs[0];
      a.after = a.dayAvgs[a.dayAvgs.length - 1];
    } else {
      a.before = null;
      a.after = null;
    }
    a.delta = a.before === null ? null : a.after - a.before;
    a.trend = a.delta === null ? "flat" : a.delta >= 0.15 ? "up" : a.delta <= -0.15 ? "down" : "flat";
    a.klass = classify_(a.avg);
  });

  const chronic = areaStats.filter((a) => a.daysAudited >= 3 && a.daysBelow === a.daysAudited);
  const withDelta = areaStats.filter((a) => a.delta !== null);
  const gains = withDelta.filter((a) => a.delta >= 0.15).sort((a, b) => b.delta - a.delta).slice(0, 3);
  const losses = withDelta.filter((a) => a.delta <= -0.15).sort((a, b) => a.delta - b.delta).slice(0, 4);

  const categories = recurringCategories_(cur, areaStats);
  const itemFailures = recurringItems_(cur);
  const deterioration = deteriorationByArea_(cur);

  const mondayDate = dates.filter((dt) => weekday_(dt) === 1)[0] || "";
  const mondayOpening = mondayDate ? cur.filter((r) => r.date === mondayDate && slotOrder_(r) === 0) : [];
  const openingRef = mondayOpening.length ? mondayOpening : cur.filter((r) => r.date === dates[0] && slotOrder_(r) === 0);

  const photosBelow3 = cur.filter((r) => r.score < 3);
  const ctx = {
    avg: cur.length ? mean_(cur.map((r) => r.score)) : null,
    chronic,
    areaStats,
    categories,
    deterioration,
    mondayDate,
    mondayOpeningAvg: mondayOpening.length ? mean_(mondayOpening.map((r) => r.score)) : null,
    photoShareBelow3: photosBelow3.length ? photosBelow3.filter((r) => r.has_photo).length / photosBelow3.length : 1,
  };

  const actions = buildActions_(ctx);

  // Plano da semana anterior: reconstrói as ações com as mesmas regras.
  let previousPlan = [];
  if (hasPrev) {
    const prevCtx = weeklyContext_(prev, unique_(prev.map((r) => r.date)).sort());
    previousPlan = buildActions_(prevCtx)
      .filter((a) => a.areaIds && a.areaIds.length)
      .map((a) => {
        const before = mean_(prev.filter((r) => a.areaIds.indexOf(r.area_id) >= 0).map((r) => r.score));
        const nowList = cur.filter((r) => a.areaIds.indexOf(r.area_id) >= 0).map((r) => r.score);
        const after = nowList.length ? mean_(nowList) : null;
        const delta = after === null ? null : after - before;
        const leitura = delta === null ? "Sem auditoria nesta semana" : delta >= 0.3 ? "Melhorou" : delta <= -0.1 ? "Piorou" : "Sem efeito visível";
        return { acao: a.acao, escopo: a.escopo, before, after, delta, leitura };
      });
  }

  const prevAvg = prev.length ? mean_(prev.map((r) => r.score)) : null;
  const prevChronic = hasPrev ? weeklyContext_(prev, unique_(prev.map((r) => r.date)).sort()).chronic.length : null;
  const bestGain = gains[0] || null;

  return {
    from,
    to,
    dates,
    days,
    count: cur.length,
    rounds: unique_(cur.map((r) => r.date + "|" + r.slot_id)).length,
    auditors: mergeNames_(unique_(cur.map((r) => r.auditor.trim()).filter(Boolean))),
    avg: ctx.avg,
    prevAvg,
    hasPrev,
    criticalCount: cur.filter((r) => r.score < 2).length,
    atMost2: cur.filter((r) => r.score <= 2).length,
    chronic,
    prevChronic,
    bestGain,
    worstAreas: areaStats.slice().sort((a, b) => a.avg - b.avg || a.label.localeCompare(b.label, "pt-BR")).slice(0, 15),
    totalAreas: areaStats.length,
    gains,
    losses,
    trendBasis: hasPrev ? "semana anterior" : "primeiro × último dia",
    categories,
    itemFailures,
    deterioration: deterioration.slice(0, 3),
    previousPlan,
    actions,
    shiftChanges: deterioration.filter((d) => d.delta <= -0.2).slice(0, 3),
    cadence: buildCadence_(categories),
    mondayDate,
    mondayOpeningAvg: ctx.mondayOpeningAvg,
    openingTwos: openingRef.filter((r) => r.score === 2).length,
    openingCount: openingRef.length,
    openingDate: openingRef.length ? openingRef[0].date : "",
    photos: cur.filter((r) => r.has_photo).length,
    prevPhotos: hasPrev ? prev.filter((r) => r.has_photo).length : null,
    prevCount: prev.length,
    hasItemScores: cur.some((r) => r.items.length),
  };
}

function weeklyContext_(list, dates) {
  const areaStats = statsByArea_(list, dates);
  areaStats.forEach((a) => (a.klass = classify_(a.avg)));
  const below3 = list.filter((r) => r.score < 3);
  const mondayDate = dates.filter((dt) => weekday_(dt) === 1)[0] || "";
  const mondayOpening = mondayDate ? list.filter((r) => r.date === mondayDate && slotOrder_(r) === 0) : [];
  return {
    avg: list.length ? mean_(list.map((r) => r.score)) : null,
    chronic: areaStats.filter((a) => a.daysAudited >= 3 && a.daysBelow === a.daysAudited),
    areaStats,
    categories: recurringCategories_(list, areaStats),
    deterioration: deteriorationByArea_(list),
    mondayDate,
    mondayOpeningAvg: mondayOpening.length ? mean_(mondayOpening.map((r) => r.score)) : null,
    photoShareBelow3: below3.length ? below3.filter((r) => r.has_photo).length / below3.length : 1,
  };
}

function statsByArea_(list, dates) {
  const byArea = groupBy_(list, (r) => r.area_id);
  return Object.keys(byArea).map((id) => {
    const rs = byArea[id];
    const areaDates = dates.filter((dt) => rs.some((r) => r.date === dt));
    const dayAvgs = areaDates.map((dt) => mean_(rs.filter((r) => r.date === dt).map((r) => r.score)));
    return {
      id,
      label: rs[0].area_label,
      avg: mean_(rs.map((r) => r.score)),
      daysAudited: areaDates.length,
      daysBelow: dayAvgs.filter((v) => v < 3).length,
      dayAvgs,
      outdoor: isOutdoor_(rs[0].area_id, rs[0].area_label),
    };
  });
}

// Categorias de problemas a partir das observações do auditor.
const PROBLEM_CATEGORIES = [
  { key: "areia", label: "Areia em brinquedos e passarelas", re: /areia/, cadence: "Sex", task: "Retirada de areia de brinquedos e passarelas" },
  { key: "piso", label: "Piso sujo / sujeira geral", re: /piso|sujeira|suj[oa]|varri|folhas?|bituca|resid|mancha|chao/, cadence: "Qua", task: "Lavagem de pisos e quadras" },
  { key: "janelas", label: "Janelas, vidros e poeira em altura", re: /janela|vidro|poeira|teia|persiana|empoeirad/, cadence: "Ter", task: "Janelas, vidros e poeira em altura" },
  { key: "estofados", label: "Estofados sujos (almofadas, pufes, tapetes)", re: /almofad|pufe|puff|tapete|estofad|sofa/, cadence: "Qui", task: "Higienização de estofados" },
  { key: "lixeiras", label: "Lixeiras cheias", re: /lixeira|lixo cheio|saco de lixo|transbord/, cadence: "Seg", task: "Revisão das lixeiras e troca de sacos" },
];

function recurringCategories_(list, areaStats) {
  const statsById = indexBy_(areaStats, (a) => a.id);
  return PROBLEM_CATEGORIES.map((c) => {
    const hits = list.filter((r) => r.notes && c.re.test(stripAccents_(r.notes.toLowerCase())));
    const byArea = groupBy_(hits, (r) => r.area_id);
    const areaIds = Object.keys(byArea).sort((a, b) => byArea[b].length - byArea[a].length);
    const affectedAvg = areaIds.length ? mean_(areaIds.map((id) => (statsById[id] ? statsById[id].avg : 3))) : 3;
    return {
      key: c.key,
      label: c.label,
      count: hits.length,
      areaIds,
      areas: areaIds.slice(0, 4).map((id) => shortLabel_(byArea[id][0].area_label)),
      impact: hits.length >= 8 || affectedAvg < 2.5 ? "Alto" : "Médio",
      cadence: c.cadence,
      task: c.task,
    };
  })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
}

function recurringItems_(list) {
  const counts = {};
  list.forEach((r) =>
    r.items.forEach((it) => {
      if (Number(it.score) < 3) {
        const k = it.item;
        counts[k] = counts[k] || { item: k, count: 0, areas: {} };
        counts[k].count += 1;
        counts[k].areas[shortLabel_(r.area_label)] = true;
      }
    })
  );
  return Object.keys(counts)
    .map((k) => ({ item: k, count: counts[k].count, areas: Object.keys(counts[k].areas).slice(0, 3) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function deteriorationByArea_(list) {
  const byArea = groupBy_(list, (r) => r.area_id);
  return Object.keys(byArea)
    .map((id) => {
      const rs = byArea[id];
      const open = rs.filter((r) => slotOrder_(r) === 0).map((r) => r.score);
      const close = rs.filter((r) => slotOrder_(r) === 3).map((r) => r.score);
      if (!open.length || !close.length) return null;
      const a = mean_(open);
      const b = mean_(close);
      return { id, label: rs[0].area_label, open: a, close: b, delta: b - a };
    })
    .filter((d) => d && d.delta < 0)
    .sort((a, b) => a.delta - b.delta);
}

// Plano de ação a partir de uma tabela fixa de regras.
function buildActions_(ctx) {
  const actions = [];
  const used = {};

  const areia = ctx.categories.filter((c) => c.key === "areia")[0];
  if (areia && areia.count >= 2) {
    actions.push({
      prio: "Crítico",
      acao: "Remover areia de brinquedos e passarelas antes da abertura, todos os dias",
      escopo: joinPt_(areia.areas),
      resp: "Equipe externa",
      prazo: "Seg",
      areaIds: areia.areaIds,
    });
  }

  if (ctx.chronic.length) {
    const chronic = ctx.chronic.slice().sort((a, b) => a.avg - b.avg);
    chronic.forEach((a) => (used[a.id] = true));
    actions.push({
      prio: "Crítico",
      acao: "Rotina fixa diária com responsável nomeado nas áreas abaixo de 3,0 em todos os dias",
      escopo: joinPt_(chronic.slice(0, 5).map((a) => shortLabel_(a.label))) + (chronic.length > 5 ? " e mais " + (chronic.length - 5) : ""),
      resp: "Supervisor de limpeza",
      prazo: "Seg",
      areaIds: chronic.map((a) => a.id),
    });
  }

  if (ctx.mondayOpeningAvg !== null && ctx.mondayOpeningAvg < 3) {
    actions.push({
      prio: "Crítico",
      acao: "Ronda de limpeza na sexta à tarde para a segunda abrir limpa (abertura de segunda: " + fmt_(ctx.mondayOpeningAvg) + ")",
      escopo: "Todas as áreas, começando pelas externas",
      resp: "Supervisor de limpeza",
      prazo: "Sex",
      areaIds: [],
    });
  }

  const worst = ctx.areaStats.filter((a) => !used[a.id] && a.avg < 3).sort((a, b) => a.avg - b.avg)[0];
  if (worst) {
    actions.push({
      prio: "Alto",
      acao: "Nomear responsável por " + shortLabel_(worst.label) + " e checar diariamente",
      escopo: shortLabel_(worst.label),
      resp: "Coordenação de Facilities",
      prazo: "Seg",
      areaIds: [worst.id],
    });
  }

  if (ctx.photoShareBelow3 < 0.5) {
    actions.push({
      prio: "Alto",
      acao: "Foto obrigatória no app para toda nota abaixo de 3,0",
      escopo: "Todas as rodadas",
      resp: "Auditor",
      prazo: "Seg",
      areaIds: [],
    });
  }

  ctx.categories
    .filter((c) => c.key !== "areia" && c.count >= 3)
    .slice(0, 2)
    .forEach((c) => {
      actions.push({
        prio: "Médio",
        acao: c.task + " na cadência semanal (" + c.count + " ocorrências)",
        escopo: joinPt_(c.areas),
        resp: "Equipe de limpeza",
        prazo: c.cadence,
        areaIds: c.areaIds,
      });
    });

  return actions.slice(0, 6);
}

function buildCadence_(categories) {
  const week = { Seg: [], Ter: [], Qua: [], Qui: [], Sex: [] };
  categories.filter((c) => c.count >= 2).forEach((c) => week[c.cadence].push(c.task));
  return ["Seg", "Ter", "Qua", "Qui", "Sex"].map((d) => ({ day: d, tasks: week[d] }));
}

// ══════════════════════════════════════════════════════════════════════════════
// TEXTOS (frases montadas a partir dos números)
// ══════════════════════════════════════════════════════════════════════════════

function weeklySummaryText_(d) {
  const parts = [];
  let s = "A nota média da semana foi <b>" + fmt_(d.avg) + "</b> numa escala de 0 a 5, " + (d.avg >= OKR_TARGET ? "acima" : "abaixo") + " da meta de " + fmt_(OKR_TARGET) + " do OKR";
  if (d.prevAvg !== null) s += " e " + (d.avg > d.prevAvg + 0.005 ? "acima" : d.avg < d.prevAvg - 0.005 ? "abaixo" : "igual") + " da semana anterior (" + fmt_(d.prevAvg) + ")";
  parts.push(s + ".");

  if (d.chronic.length) {
    const names = d.chronic.slice().sort((a, b) => a.avg - b.avg).slice(0, 3).map((a) => shortLabel_(a.label));
    const outdoor = d.chronic.filter((a) => a.outdoor).length;
    let c = (d.chronic.length === 1 ? "Uma área ficou" : numberWord_(d.chronic.length) + " áreas ficaram") + " abaixo de 3,0 em todos os dias auditados, entre elas " + joinPt_(names) + ".";
    if (outdoor * 2 > d.chronic.length) c = "O problema principal são as áreas externas: " + c.charAt(0).toLowerCase() + c.slice(1);
    parts.push(c);
  }

  const areia = d.categories.filter((c) => c.key === "areia")[0];
  if (areia && areia.count >= 2) parts.push("As observações citam areia acumulada " + areia.count + " vezes.");

  if (d.mondayOpeningAvg !== null && d.mondayOpeningAvg < 3) {
    parts.push("A abertura de segunda teve nota " + fmt_(d.mondayOpeningAvg) + ", sinal de que a limpeza da sexta à tarde ou do fim de semana não está acontecendo.");
  } else if (d.days.length) {
    const worstDay = d.days.slice().sort((a, b) => a.avg - b.avg)[0];
    parts.push("O pior dia foi " + weekdayLong_(worstDay.date) + " (" + fmt_(worstDay.avg) + ").");
  }

  if (d.bestGain) parts.push("Maior melhora: " + shortLabel_(d.bestGain.label) + ", de " + fmt_(d.bestGain.before) + " para " + fmt_(d.bestGain.after) + ".");
  return parts.join(" ");
}

function auditQualityText_(d) {
  const parts = [];
  if (d.days.length >= 2) {
    const first = d.days[0].photos;
    const last = d.days[d.days.length - 1].photos;
    if (first !== last) parts.push("As fotos " + (last < first ? "caíram" : "subiram") + " de <b>" + first + "</b> no primeiro dia para <b>" + last + "</b> no último.");
    else parts.push("Foram <b>" + d.photos + "</b> registros com foto na semana, de " + d.count + ".");
  }
  if (d.openingCount && d.openingTwos * 3 >= d.openingCount) {
    parts.push("Na abertura de " + weekdayLong_(d.openingDate) + ", <b>" + d.openingTwos + " das " + d.openingCount + "</b> áreas receberam exatamente 2,0.");
  }
  if (!parts.length) return "";
  return parts.join(" ") + " Sem evidência, as notas da semana devem ser lidas com cautela.";
}

// ══════════════════════════════════════════════════════════════════════════════
// HTML
// ══════════════════════════════════════════════════════════════════════════════

const STATUS_SQUARE = { "Crítico": "sq-k", "Urgente": "sq-k", "Requer correção": "sq-y", "Adequado": "sq-t" };

function renderDailyHtml_(d) {
  const statusOf = (s) => getContractorScoreStatus(s);
  const urgentCount = d.toFix.filter((r) => r.score < 3).length;
  const fixCount = d.toFix.length - urgentCount;

  let html = '<div class="cx-daily">';
  html += '<div class="cx-top"><div class="cx-logo"><img src="data:image/png;base64,' + CONCEPT_LOGO_B64 + '" alt="Escola Concept"></div>';
  html += '<div class="cx-date"><b>' + esc_(weekdayShortDate_(d.date)) + "</b><span>Campus São Paulo</span></div></div>";

  html += '<div class="cx-hero"><div class="cx-ghost">Lim<br>peza</div><div class="cx-title"><h1>Relatório<br>diário</h1><span class="lt">de limpeza</span>';
  html += "<p><b>" + d.rounds + " rodada" + plural_(d.rounds) + " · " + d.areas + " áreas · " + d.count + " registros</b> &nbsp;·&nbsp; enviado todo dia às 17:30</p></div></div>";

  if (!d.count) {
    html += '<div class="cx-quote"><div class="qm">“</div><p><b>Nenhuma auditoria concluída nesta data.</b></p></div>';
    return html + dailyFooter_() + "</div>";
  }

  html += '<div class="cx-figs">';
  html += fig_("sq-y", "Nota do dia", fmt_(d.avg), "meta " + fmt_(OKR_TARGET) + (d.prevAvg !== null ? " · anterior " + fmt_(d.prevAvg) : ""));
  html += fig_("sq-y", "Abaixo de 3,0", d.below3, "de " + d.count + " registros");
  html += fig_("sq-t", "Críticos (&lt; 2,0)", d.critical, d.prevAvg !== null ? "anterior " + d.prevCritical : "");
  html += fig_("sq-k", "Com foto", d.photos, "de " + d.count + " registros");
  html += "</div>";

  if (d.warning) html += '<div class="cx-quote"><div class="qm">“</div><p>' + d.warning + "</p></div>";

  if (d.priorities.length) {
    html += '<div class="cx-sec"><h3>Corrigir<span class="lt">primeiro</span></h3><span class="tag">Próximo dia até 9h</span></div>';
    d.priorities.forEach((p) => {
      const desc = [p.roundsText].concat(p.notes).join(" · ");
      html += '<div class="cx-pri"><div class="arr">→</div><div><div class="a">' + esc_(p.label) + '</div><div class="d">' + esc_(desc) + "</div>";
      if (p.failed.length) html += '<div class="f"><b>Falhou</b>' + esc_(p.failed.map((f) => f.toLowerCase()).join(", ")) + "</div>";
      html += '</div><div class="n">' + fmt_(p.avg) + "</div></div>";
    });
  }

  html += '<div class="cx-sec"><h3>Todas as áreas<span class="lt">auditadas</span></h3><span class="tag">Piores primeiro</span></div>';
  html += "<table><thead><tr><th>Área</th><th>Rodada</th><th class=\"num\">Nota</th><th>Status</th><th>Obs. / foto</th><th>Fornecedor</th></tr></thead><tbody>";
  d.toFix.forEach((r) => {
    const st = statusOf(r.score);
    const obs = [r.notes ? truncate_(r.notes, 70) : "", r.has_photo ? "foto" : ""].filter(Boolean).join(" · ") || "—";
    html += "<tr><td>" + esc_(r.area_label) + "</td><td>" + esc_(r.slot_label) + '</td><td class="num">' + fmt_(r.score) + '</td><td><span class="st"><i class="sq ' + STATUS_SQUARE[st] + '"></i>' + esc_(st) + "</span></td><td>" + esc_(obs) + '</td><td><i class="chk"></i>Feito</td></tr>';
  });
  if (d.ok.length) {
    const names = unique_(d.ok.map((r) => shortLabel_(r.area_label)));
    html += '<tr><td colspan="6"><span class="st"><i class="sq sq-t"></i><b style="font-weight:600">Adequado</b></span> &nbsp;' + d.ok.length + " registro" + plural_(d.ok.length) + ": " + esc_(names.slice(0, 6).join(", ")) + (names.length > 6 ? "…" : "") + "</td></tr>";
  }
  html += "</tbody></table>";
  html += '<div class="key"><span><i class="sq sq-k"></i>Crítico / Urgente (' + urgentCount + ')</span><span><i class="sq sq-y"></i>Requer correção (' + fixCount + ')</span><span><i class="sq sq-t"></i>Adequado (' + d.ok.length + ")</span></div>";
  if (!d.hasItemScores) html += '<div class="cx-note">A nota de cada item do checklist ainda não chegou para esta data, por isso o relatório não indica quais itens falharam.</div>';

  return html + dailyFooter_() + "</div>";
}

function dailyFooter_() {
  return '<div class="cx-foot"><span><b>Escola Concept</b> · Auditoria de limpeza</span><span>Relatório diário</span></div>';
}

function fig_(sq, label, value, sub) {
  return '<div class="cx-fig"><div class="l"><i class="sq ' + sq + '"></i>' + label + '</div><div class="v">' + value + '</div><div class="s">' + (sub || "&nbsp;") + "</div></div>";
}

function renderWeeklyHtml_(d) {
  const range = formatRangeShort_(d.from, d.to);
  const foot = '<div class="cx-foot"><span><b>escola Concept</b> · Recomendações da semana · ' + range + "</span><span>Campus São Paulo</span></div>";
  let n = 0;
  const head = (title, em, mark) => {
    n += 1;
    const marks = { calc: '<span class="mk calc">calculado</span>', red: '<span class="mk red">texto redigido</span>', new: '<span class="mk new">novo</span>', obs: '<span class="mk red">agrupado das observações</span>' };
    return '<div class="cx-h"><h3><span class="n">' + pad2_(n) + "</span>" + title + (em ? "<em>" + em + "</em>" : "") + "</h3>" + (marks[mark] || "") + "</div>";
  };

  let html = '<div class="cx-weekly">';

  // Capa
  html += '<section class="cx-page cx-cover">';
  html += '<div class="cx-ghost" style="right:-16px;top:118px;font-size:176px;text-align:right">SEMA<br>NA</div>';
  html += '<div class="cx-top"><img class="cx-logo" alt="escola Concept" src="data:image/png;base64,' + CONCEPT_LOGO_B64 + '"><div class="cx-issue"><b>Campus São Paulo</b>Relatório semanal</div></div>';
  html += '<div class="cx-cover-title"><div class="cx-kicker"><i></i>Auditoria de Qualidade de Espaços</div><h1>Recomendações<small>da semana</small></h1></div>';
  html += '<div class="cx-facts"><div><span>Período</span><b>' + esc_(formatRangeLong_(d.from, d.to)) + "</b></div>";
  html += "<div><span>Cobertura</span><b>" + d.dates.length + " dia" + plural_(d.dates.length) + " · " + d.rounds + " rodadas · " + d.count + " registros</b></div>";
  html += "<div><span>Auditor</span><b>" + esc_(d.auditors.join(", ") || "—") + "</b></div></div>";

  if (!d.count) {
    html += '<div class="cx-sec" style="margin-top:38px"><p class="lead quote">Nenhuma auditoria concluída neste período.</p></div>' + foot + "</section></div>";
    return html;
  }

  html += '<div class="cx-sec" style="margin-top:38px">' + head("Sumário", "executivo", "red") + '<p class="lead quote">' + weeklySummaryText_(d) + "</p></div>";

  html += '<div class="cx-sec" style="margin-top:26px">' + head("Indicadores-chave", "", "calc") + '<div class="kpis">';
  html += '<div class="hl"><b>' + fmt_(d.avg) + "</b><span>Nota média da semana (meta OKR " + fmt_(OKR_TARGET) + ")</span></div>";
  html += "<div><b>" + d.criticalCount + "</b><span>Registros críticos (&lt;&nbsp;2,0)</span></div>";
  html += "<div><b>" + d.atMost2 + "</b><span>Registros com nota até 2,0</span></div>";
  html += "<div><b>" + d.chronic.length + "</b><span>Áreas abaixo de 3,0 em todos os dias</span></div>";
  html += d.bestGain
    ? "<div><b>" + fmt_(d.bestGain.after) + "</b><span>Maior melhora: " + esc_(shortLabel_(d.bestGain.label)) + ", de " + fmt_(d.bestGain.before) + " para " + fmt_(d.bestGain.after) + "</span></div>"
    : "<div><b>—</b><span>Nenhuma área melhorou 0,15 ou mais</span></div>";
  html += "</div></div>" + foot + "</section>";

  // Diagnóstico, tendências, problemas
  html += '<section class="cx-page">';
  html += '<div class="cx-sec">' + head("Diagnóstico", "por área", "calc");
  html += '<table><thead><tr><th>Área</th><th class="num">Nota média</th><th class="num">Dias abaixo de 3,0</th><th>Tendência</th><th>Classificação</th></tr></thead><tbody>';
  d.worstAreas.forEach((a) => {
    const tr = a.trend === "up" ? '<td class="tr up">↗ Melhorando</td>' : a.trend === "down" ? '<td class="tr down">↘ Piorando</td>' : '<td class="tr flat">→ Estável</td>';
    html += '<tr><td class="area">' + esc_(shortLabel_(a.label)) + '</td><td class="num">' + fmt_(a.avg) + '</td><td class="num">' + a.daysBelow + " de " + a.daysAudited + "</td>" + tr + '<td><span class="sv ' + a.klass.css + '">' + a.klass.label + "</span></td></tr>";
  });
  if (d.totalAreas > d.worstAreas.length) html += '<tr><td class="note" colspan="5">As ' + d.worstAreas.length + " piores de " + d.totalAreas + " áreas auditadas. Tendência comparada com: " + d.trendBasis + ".</td></tr>";
  html += "</tbody></table></div>";

  html += '<div class="cx-sec">' + head("Análise", "de tendências", "red") + '<div class="cols"><div>';
  html += '<h4 style="margin-top:0">Em melhora</h4>' + trendList_(d.gains, true, "Nenhuma área melhorou 0,15 ou mais.");
  html += "<h4>Em piora</h4>" + trendList_(d.losses, false, "Nenhuma área piorou 0,15 ou mais.");
  html += '<p style="color:#8A8A8A;font-size:9.5px;margin-top:4px">Comparação: ' + d.trendBasis + ".</p>";
  html += "</div><div>" + dailyChartSvg_(d) + "</div></div></div>";

  html += '<div class="cx-sec">' + head("Problemas", "recorrentes", "obs");
  if (d.categories.length) {
    html += '<table><thead><tr><th>Categoria</th><th class="num">Ocorrências</th><th>Áreas mais afetadas</th><th>Impacto</th></tr></thead><tbody>';
    d.categories.forEach((c) => {
      html += '<tr><td class="area">' + esc_(c.label) + '</td><td class="num">' + c.count + "</td><td>" + esc_(c.areas.join(", ")) + '</td><td><span class="sv ' + (c.impact === "Alto" ? "alto" : "med") + '">' + c.impact + "</span></td></tr>";
    });
    html += "</tbody></table>";
  } else {
    html += "<p>Nenhuma observação registrada nesta semana.</p>";
  }
  if (d.itemFailures.length) {
    html += '<h4>Itens do checklist que mais falharam</h4><table><thead><tr><th>Item</th><th class="num">Vezes abaixo de 3,0</th><th>Áreas</th></tr></thead><tbody>';
    d.itemFailures.forEach((it) => (html += '<tr><td class="area">' + esc_(it.item) + '</td><td class="num">' + it.count + "</td><td>" + esc_(it.areas.join(", ")) + "</td></tr>"));
    html += "</tbody></table>";
  }
  html += "</div>" + foot + "</section>";

  // Deterioração, plano anterior, plano de ação
  html += '<section class="cx-page">';
  html += '<div class="cx-sec">' + head("Deterioração", "ao longo do dia", "calc");
  if (d.deterioration.length) {
    html += '<table><thead><tr><th>Área</th><th class="num">Abertura</th><th class="num">Encerramento</th><th class="num">Variação</th></tr></thead><tbody>';
    d.deterioration.forEach((x) => (html += '<tr><td class="area">' + esc_(shortLabel_(x.label)) + '</td><td class="num">' + fmt_(x.open) + '</td><td class="num">' + fmt_(x.close) + '</td><td class="num neg">' + signed_(x.delta) + "</td></tr>"));
    html += "</tbody></table>";
  } else {
    html += "<p>Nenhuma área terminou o dia com nota menor que a da abertura.</p>";
  }
  html += "</div>";

  html += '<div class="cx-sec">' + head("O que aconteceu", "com o plano da semana anterior", "new");
  if (d.previousPlan.length) {
    html += '<table><thead><tr><th style="width:36%">Ação recomendada</th><th>Área</th><th class="num">Antes</th><th class="num">Agora</th><th>Execução</th><th>Leitura</th></tr></thead><tbody>';
    d.previousPlan.forEach((p) => {
      const cls = p.leitura === "Melhorou" ? "tr up" : p.leitura === "Piorou" ? "tr down" : "";
      html += '<tr><td class="area">' + esc_(p.acao) + "</td><td>" + esc_(p.escopo) + '</td><td class="num">' + fmt_(p.before) + '</td><td class="num">' + (p.after === null ? "—" : fmt_(p.after)) + '</td><td style="color:#8A8A8A">sem registro</td><td class="' + cls + '">' + p.leitura + "</td></tr>";
    });
    html += "</tbody></table>";
  } else {
    html += "<p>" + (d.prevCount ? "A semana anterior não gerou ações com áreas específicas." : "Não há auditoria na semana anterior, então ainda não existe plano para comparar.") + "</p>";
  }
  html += "</div>";

  html += '<div class="cx-sec">' + head("Plano de ação", "próxima semana", "red");
  html += '<h4 style="margin-top:4px">Ações imediatas</h4>';
  if (d.actions.length) {
    html += '<table><thead><tr><th style="width:13%">Prioridade</th><th style="width:36%">Ação</th><th>Área / escopo</th><th>Responsável</th><th>Prazo</th></tr></thead><tbody>';
    d.actions.forEach((a) => {
      const sv = a.prio === "Crítico" ? "crit" : a.prio === "Alto" ? "alto" : "med";
      html += '<tr><td><span class="sv ' + sv + '">' + a.prio + '</span></td><td class="area">' + esc_(a.acao) + "</td><td>" + esc_(a.escopo) + "</td><td>" + esc_(a.resp) + "</td><td>" + a.prazo + "</td></tr>";
    });
    html += "</tbody></table>";
  } else {
    html += "<p>Nenhuma ação urgente: todas as áreas ficaram acima de 3,0.</p>";
  }

  html += '<h4 style="margin-top:22px">Ajustes na rotina por turno</h4>';
  if (d.shiftChanges.length) {
    html += '<ul class="arw" style="max-width:520px"><li><b>Encerramento</b> passa a incluir retorno a ' + esc_(joinPt_(d.shiftChanges.map((x) => shortLabel_(x.label)))) + ", " + (d.shiftChanges.length === 1 ? "a área que mais piora" : "as áreas que mais pioram") + " ao longo do dia.</li></ul>";
  } else {
    html += '<p style="color:#7A7A7A">Sem mudança: nenhuma área caiu 0,2 ou mais entre a abertura e o encerramento.</p>';
  }

  html += '<h4 style="margin-top:22px">Cadência de limpeza de fundo</h4><div class="week">';
  d.cadence.forEach((c) => (html += "<div><span>" + c.day + "</span>" + (c.tasks.length ? esc_(c.tasks.join("; ")) : '<em class="muted">rotina atual</em>') + "</div>"));
  html += "</div></div>";

  // Metas e qualidade (na mesma página quando couber)
  html += '<div class="cx-sec" style="break-inside:avoid">' + head("Metas", "e monitoramento", "calc");
  html += '<table><thead><tr><th>Indicador</th><th class="num">Esta semana</th><th class="num">Semana anterior</th><th class="num">Meta OKR</th></tr></thead><tbody>';
  html += '<tr><td class="area">Nota média geral</td><td class="num"><b>' + fmt_(d.avg) + '</b></td><td class="num">' + (d.prevAvg === null ? "—" : fmt_(d.prevAvg)) + '</td><td class="num">' + fmt_(OKR_TARGET) + "</td></tr>";
  html += '<tr><td class="area">Áreas abaixo de 3,0 em todos os dias</td><td class="num"><b>' + d.chronic.length + '</b></td><td class="num">' + (d.prevChronic === null ? "—" : d.prevChronic) + '</td><td class="num">0</td></tr>';
  html += '<tr><td class="area">Registros com foto</td><td class="num"><b>' + d.photos + " de " + d.count + '</b></td><td class="num">' + (d.prevPhotos === null ? "—" : d.prevPhotos + " de " + d.prevCount) + '</td><td class="num">todos abaixo de 3,0</td></tr>';
  html += "</tbody></table></div>";

  const quality = auditQualityText_(d);
  if (quality) html += '<div class="closing" style="break-inside:avoid"><div class="lbl"><i></i>Qualidade da auditoria</div><p>' + quality + "</p></div>";

  html += foot + "</section></div>";
  return html;
}

function trendList_(list, up, empty) {
  if (!list.length) return '<p style="color:#8A8A8A">' + empty + "</p>";
  return '<ul class="arw">' + list.map((a) => "<li><b>" + esc_(shortLabel_(a.label)) + "</b> (" + (up ? signed_(a.delta) : "de " + fmt_(a.before) + " para " + fmt_(a.after)) + ")</li>").join("") + "</ul>";
}

// Gráfico da nota média por dia (SVG gerado a partir dos dados).
function dailyChartSvg_(d) {
  const W = 300, x0 = 30, x1 = 296, yTop = 20, yBot = 140;
  const lo = 2, hi = 4;
  const vals = d.days.map((x) => x.avg);
  const minV = Math.min.apply(null, vals.concat([lo]));
  const bottom = Math.floor(minV * 2) / 2;
  const yOf = (v) => yBot - ((v - bottom) / (hi - bottom)) * (yBot - yTop);
  const n = d.days.length;
  const xOf = (i) => (n === 1 ? (x0 + x1) / 2 : 56 + (i * (280 - 56)) / (n - 1));

  let svg = '<div class="chart-cap">Nota média por dia <span>calculado</span></div>';
  svg += '<svg viewBox="0 0 ' + W + ' 172" width="100%" role="img">';
  svg += '<g stroke="#E4E4E4" stroke-width="1">';
  const ticks = [];
  for (let v = bottom; v <= hi + 0.001; v += 0.5) ticks.push(v);
  ticks.forEach((v, i) => (svg += '<line x1="' + x0 + '" y1="' + yOf(v).toFixed(1) + '" x2="' + x1 + '" y2="' + yOf(v).toFixed(1) + '"' + (i === 0 ? ' stroke="#4A4A4A"' : "") + "/>"));
  svg += '</g><g font-size="10" fill="#9A9A9A" text-anchor="end" letter-spacing="1">';
  ticks.forEach((v) => (svg += '<text x="22" y="' + (yOf(v) + 3).toFixed(1) + '">' + fmt_(v, 1) + "</text>"));
  svg += "</g>";
  const yT = yOf(OKR_TARGET).toFixed(1);
  svg += '<line x1="' + x0 + '" y1="' + yT + '" x2="' + x1 + '" y2="' + yT + '" stroke="#FBB72C" stroke-width="2" stroke-dasharray="5 4"/>';
  svg += '<text x="' + x1 + '" y="' + (yOf(OKR_TARGET) - 6).toFixed(1) + '" font-size="10" font-weight="700" fill="#4A4A4A" text-anchor="end" letter-spacing="1.5">META OKR ' + fmt_(OKR_TARGET) + "</text>";
  const yM = yOf(d.avg).toFixed(1);
  svg += '<line x1="' + x0 + '" y1="' + yM + '" x2="' + x1 + '" y2="' + yM + '" stroke="#BDBDBD" stroke-width="1"/>';
  svg += '<text x="34" y="' + (yOf(d.avg) + 12).toFixed(1) + '" font-size="9.5" fill="#9A9A9A" letter-spacing="1.2">MÉDIA ' + fmt_(d.avg) + "</text>";
  if (n > 1) svg += '<polyline fill="none" stroke="#4A4A4A" stroke-width="2" points="' + d.days.map((x, i) => xOf(i).toFixed(1) + "," + yOf(x.avg).toFixed(1)).join(" ") + '"/>';
  const minIdx = vals.indexOf(Math.min.apply(null, vals));
  d.days.forEach((x, i) => {
    const cx = xOf(i), cy = yOf(x.avg);
    svg += '<rect x="' + (cx - 4).toFixed(1) + '" y="' + (cy - 4).toFixed(1) + '" width="8" height="8" fill="' + (i === minIdx ? "#1E3A6E" : "#4A4A4A") + '"/>';
    const below = i === minIdx;
    svg += '<text x="' + cx.toFixed(1) + '" y="' + (below ? cy + 18 : cy - 9).toFixed(1) + '" font-size="11" font-weight="700" fill="#4A4A4A" text-anchor="middle">' + fmt_(x.avg) + "</text>";
    svg += '<text x="' + cx.toFixed(1) + '" y="160" font-size="10.5" font-weight="500" fill="#7A7A7A" text-anchor="middle" letter-spacing="2">' + PT_WEEKDAY_SHORT[weekday_(x.date)].toUpperCase() + "</text>";
  });
  return svg + "</svg>";
}

// Ajustes de impressão sobre o CSS dos mockups (que foram feitos para tela).
const CONCEPT_PRINT_CSS =
  "*{-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
  "html,body{margin:0;padding:0;background:#fff}" +
  // diário: página contínua, sem borda nem altura fixa
  "@page{size:A4;margin:12mm 0 16mm}" +
  "@page:first{margin-top:0}" +
  ".cx-daily{width:auto!important;height:auto!important;margin:0!important;border:0!important;overflow:visible!important;padding:40px 58px 0!important}" +
  ".cx-daily .cx-foot{position:static!important;margin:28px 0 0}" +
  ".cx-daily tr{break-inside:avoid}.cx-daily thead{display:table-header-group}" +
  ".cx-daily .cx-pri{break-inside:avoid}" +
  // semanal: páginas fluídas
  ".cx-weekly{background:#fff!important;padding:0!important}" +
  ".cx-weekly .cx-page{width:auto!important;height:auto!important;margin:0!important;padding:0 64px!important;overflow:visible!important}" +
  ".cx-weekly .cx-page + .cx-page{padding-top:30px!important}" +
  ".cx-weekly .cx-cover{padding-top:58px!important;min-height:270mm;break-after:page}" +
  ".cx-weekly .cx-cover + .cx-page{padding-top:0!important}" +
  ".cx-weekly .cx-foot{position:static!important;margin:28px 0 0}" +
  ".cx-weekly .cx-page .cx-foot{display:none}.cx-weekly .cx-page:last-child .cx-foot{display:flex}" +
  ".cx-weekly .cx-cover .cx-foot{display:none}" +
  ".cx-weekly tr{break-inside:avoid}.cx-weekly thead{display:table-header-group}" +
  ".cx-weekly .cx-h{break-after:avoid}";

function buildConceptDocument_(bodyHtml, css, fontsCss) {
  return (
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>' +
    (fontsCss || "") +
    css +
    CONCEPT_PRINT_CSS +
    "</style></head><body>" +
    bodyHtml +
    "</body></html>"
  );
}

function renderDailyDocument_(data, fontsCss) {
  return buildConceptDocument_(renderDailyHtml_(data), CONCEPT_DAILY_CSS, fontsCss);
}

function renderWeeklyDocument_(data, fontsCss) {
  return buildConceptDocument_(renderWeeklyHtml_(data), CONCEPT_WEEKLY_CSS, fontsCss);
}

// ══════════════════════════════════════════════════════════════════════════════
// PDF E DRIVE (Apps Script)
// ══════════════════════════════════════════════════════════════════════════════

function htmlToPdf_(bodyHtml, fileName) {
  const css = bodyHtml.indexOf('class="cx-weekly"') >= 0 ? CONCEPT_WEEKLY_CSS : CONCEPT_DAILY_CSS;
  const doc = buildConceptDocument_(bodyHtml, css, conceptFontsCss_());
  return Utilities.newBlob(doc, "text/html", "relatorio.html").getAs("application/pdf").setName(fileName);
}

// Busca as fontes do Google Fonts e embute em base64. Se falhar, segue com
// fontes do sistema para o relatório nunca deixar de sair.
let conceptFontsCache_ = null;
function conceptFontsCss_() {
  if (conceptFontsCache_ !== null) return conceptFontsCache_;
  try {
    const css = UrlFetchApp.fetch(CONCEPT_FONTS_URL).getContentText();
    conceptFontsCache_ = css.replace(/url\((https:[^)]+)\)\s*format\('([^']+)'\)/g, function (_, url, format) {
      const bytes = UrlFetchApp.fetch(url).getBlob().getBytes();
      const mime = format === "woff2" ? "font/woff2" : format === "woff" ? "font/woff" : "font/ttf";
      return "url(data:" + mime + ";base64," + Utilities.base64Encode(bytes) + ") format('" + format + "')";
    });
  } catch (err) {
    conceptFontsCache_ = "";
  }
  return conceptFontsCache_;
}

function getOrCreateReportFolder_() {
  const folders = DriveApp.getFoldersByName(WEEKLY_REPORT_FOLDER);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(WEEKLY_REPORT_FOLDER);
}

// Nunca sobrescreve nem apaga: se o nome já existe, acrescenta _v2, _v3…
function saveToReportFolder_(blob) {
  const folder = getOrCreateReportFolder_();
  const base = blob.getName().replace(/\.pdf$/i, "");
  let name = base + ".pdf";
  let v = 2;
  while (folder.getFilesByName(name).hasNext()) {
    name = base + "_v" + v + ".pdf";
    v += 1;
  }
  blob.setName(name);
  return folder.createFile(blob);
}

// ══════════════════════════════════════════════════════════════════════════════
// AUXILIARES
// ══════════════════════════════════════════════════════════════════════════════

function classify_(avg) {
  if (avg < 2) return { label: "Crítica", css: "crit" };
  if (avg < 3) return { label: "Insatisfatória", css: "ins" };
  if (avg < 4) return { label: "Regular", css: "alto" };
  return { label: "Adequada", css: "med" };
}

// Ordem das rodadas: Abertura 0, almoço 1, tarde 2, Encerramento 3.
function slotOrder_(r) {
  const label = stripAccents_(String(r.slot_label || "").toLowerCase());
  if (label.indexOf("abertura") >= 0) return 0;
  if (label.indexOf("almoco") >= 0) return 1;
  if (label.indexOf("tarde") >= 0) return 2;
  if (label.indexOf("encerramento") >= 0) return 3;
  const id = parseInt(r.slot_id, 10);
  return id <= 700 ? 0 : id <= 1130 ? 1 : id <= 1430 ? 2 : 3;
}

function worstItems_(list, max) {
  const byItem = {};
  list.forEach((r) => r.items.forEach((it) => {
    const s = Number(it.score);
    if (isNaN(s)) return;
    byItem[it.item] = byItem[it.item] === undefined ? s : Math.min(byItem[it.item], s);
  }));
  return Object.keys(byItem).filter((k) => byItem[k] < 3).sort((a, b) => byItem[a] - byItem[b]).slice(0, max);
}

function isOutdoor_(id, label) {
  return /quadra|playground|patio|pátio|skate|piscina|casa_arvore|externa|ext$|portaria/i.test(id + " " + label) && !/wc|banheiro/i.test(id + " " + label);
}

function previousAuditDate_(rows, date) {
  const earlier = unique_(rows.map((r) => r.date).filter((dt) => dt < date)).sort();
  return earlier.length ? earlier[earlier.length - 1] : "";
}

function mondayOf_(date) {
  const wd = weekday_(date);
  return addDays_(date, -((wd + 6) % 7));
}

function parseYmd_(s) {
  const p = String(s).split("-").map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
}

function ymd_(dt) {
  return dt.getUTCFullYear() + "-" + pad2_(dt.getUTCMonth() + 1) + "-" + pad2_(dt.getUTCDate());
}

function addDays_(s, n) {
  const dt = parseYmd_(s);
  dt.setUTCDate(dt.getUTCDate() + n);
  return ymd_(dt);
}

function weekday_(s) {
  return parseYmd_(s).getUTCDay();
}

function weekdayLong_(s) {
  return ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][weekday_(s)] + " (" + s.slice(8, 10) + "/" + s.slice(5, 7) + ")";
}

function weekdayShortDate_(s) {
  const dt = parseYmd_(s);
  return PT_WEEKDAY_SHORT[dt.getUTCDay()] + ", " + dt.getUTCDate() + " " + PT_MONTH_SHORT[dt.getUTCMonth()] + " " + dt.getUTCFullYear();
}

function formatRangeShort_(from, to) {
  return from.slice(8, 10) + "/" + from.slice(5, 7) + " a " + to.slice(8, 10) + "/" + to.slice(5, 7) + "/" + to.slice(0, 4);
}

function formatRangeLong_(from, to) {
  const a = parseYmd_(from), b = parseYmd_(to);
  if (a.getUTCMonth() === b.getUTCMonth()) return a.getUTCDate() + " a " + b.getUTCDate() + " de " + PT_MONTH_LONG[b.getUTCMonth()] + " de " + b.getUTCFullYear();
  return a.getUTCDate() + " de " + PT_MONTH_LONG[a.getUTCMonth()] + " a " + b.getUTCDate() + " de " + PT_MONTH_LONG[b.getUTCMonth()] + " de " + b.getUTCFullYear();
}

function fmt_(v, digits) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return Number(v).toFixed(digits === undefined ? 2 : digits).replace(".", ",");
}

function signed_(v) {
  return (v > 0 ? "+" : v < 0 ? "−" : "") + fmt_(Math.abs(v));
}

function pad2_(n) {
  return (n < 10 ? "0" : "") + n;
}

function plural_(n) {
  return n === 1 ? "" : "s";
}

function numberWord_(n) {
  const w = ["Zero", "Uma", "Duas", "Três", "Quatro", "Cinco", "Seis", "Sete", "Oito", "Nove", "Dez"];
  return w[n] || String(n);
}

function mean_(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

function groupBy_(arr, keyFn) {
  return arr.reduce((acc, x) => {
    const k = keyFn(x);
    (acc[k] = acc[k] || []).push(x);
    return acc;
  }, {});
}

function indexBy_(arr, keyFn) {
  return arr.reduce((acc, x) => ((acc[keyFn(x)] = x), acc), {});
}

function unique_(arr) {
  return arr.filter((x, i) => arr.indexOf(x) === i);
}

// "Anderson" e "Anderson Silva" viram só "Anderson Silva".
function mergeNames_(names) {
  return names.filter((n) => !names.some((m) => m !== n && m.toLowerCase().indexOf(n.toLowerCase() + " ") === 0));
}

function joinPt_(arr) {
  if (arr.length <= 1) return arr.join("");
  return arr.slice(0, -1).join(", ") + " e " + arr[arr.length - 1];
}

function shortLabel_(label) {
  return String(label || "").replace(/ — /g, " · ").replace(/Banheiros e sanitários/g, "Banheiros");
}

function truncate_(s, n) {
  s = String(s).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function stripAccents_(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function esc_(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
