/* eslint-disable prettier/prettier */
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
import jsPDF from "jspdf";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Download, MousePointer2, FileDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/")({
  component: Index,
});

type FieldKey = "name" | "date" | "time";

interface Field {
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily: string;
  align: CanvasTextAlign;
}

const DEFAULT_FIELDS: Record<FieldKey, Field> = {
  name: { x: 0.5, y: 0.5, fontSize: 48, color: "#1a1a1a", fontFamily: "serif", align: "center" },
  date: { x: 0.5, y: 0.7, fontSize: 24, color: "#1a1a1a", fontFamily: "serif", align: "center" },
  time: { x: 0.5, y: 0.78, fontSize: 24, color: "#1a1a1a", fontFamily: "serif", align: "center" },
};

const FIELD_LABELS: Record<FieldKey, string> = {
  name: "Nome do participante",
  date: "Data",
  time: "Hora",
};

function renderCertificate(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  fields: Record<FieldKey, Field>,
  values: Record<FieldKey, string>,
  selected?: FieldKey | null,
) {
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);

  (Object.keys(fields) as FieldKey[]).forEach((key) => {
    const f = fields[key];
    ctx.fillStyle = f.color;
    ctx.font = `${f.fontSize}px ${f.fontFamily}`;
    ctx.textAlign = f.align;
    ctx.textBaseline = "middle";
    ctx.fillText(values[key], f.x * canvas.width, f.y * canvas.height);

    if (selected && key === selected) {
      const metrics = ctx.measureText(values[key]);
      const w = metrics.width;
      const h = f.fontSize;
      const cx = f.x * canvas.width;
      const cy = f.y * canvas.height;
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(cx - w / 2 - 6, cy - h / 2 - 4, w + 12, h + 8);
      ctx.setLineDash([]);
    }
  });
}

function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fields, setFields] = useState<Record<FieldKey, Field>>(DEFAULT_FIELDS);
  const [values, setValues] = useState({
    name: "João da Silva",
    date: new Date().toLocaleDateString("pt-BR"),
    time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  });
  const [selected, setSelected] = useState<FieldKey>("name");
  const [placingMode, setPlacingMode] = useState(false);
  const [dragging, setDragging] = useState<FieldKey | null>(null);
  const [participantList, setParticipantList] = useState("");
  const [generating, setGenerating] = useState(false);
  const useQueryResult = useQuery({
    queryKey: ["fetchMembers"],
    queryFn: loadMembers})

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = url;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    renderCertificate(canvas, image, fields, values, selected);
  }, [image, fields, values, selected]);

  function getRelativePos(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!image) return;
    const { x, y } = getRelativePos(e);
    if (placingMode) {
      setFields((prev) => ({ ...prev, [selected]: { ...prev[selected], x, y } }));
      setPlacingMode(false);
      return;
    }
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let hit: FieldKey | null = null;
    (Object.keys(fields) as FieldKey[]).forEach((key) => {
      const f = fields[key];
      ctx.font = `${f.fontSize}px ${f.fontFamily}`;
      const w = ctx.measureText(values[key]).width / canvas.width;
      const h = f.fontSize / canvas.height;
      if (Math.abs(x - f.x) < w / 2 + 0.01 && Math.abs(y - f.y) < h / 2 + 0.01) {
        hit = key;
      }
    });
    if (hit) {
      setSelected(hit);
      setDragging(hit);
    }
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragging) return;
    const { x, y } = getRelativePos(e);
    setFields((prev) => ({ ...prev, [dragging]: { ...prev[dragging], x, y } }));
  }

  async function loadMembers() {
    const data = await fetch("http://localhost:3000/participantes/names").then((res) => res.json());
    setParticipantList(data.map((d: { name: string; date?: string; time?: string }) => `${d.name}; ${d.date || ""}; ${d.time || ""}`).join("\n"));
  }

  function handleCanvasMouseUp() {
    setDragging(null);
  }

  function buildPdf(participants: Array<{ name: string; date?: string; time?: string }>) {
    if (!image) return null;
    const off = document.createElement("canvas");
    const orientation = image.width >= image.height ? "landscape" : "portrait";
    const pdf = new jsPDF({
      orientation,
      unit: "px",
      format: [image.width, image.height],
      hotfixes: ["px_scaling"],
    });

    participants.forEach((p, idx) => {
      const v = {
        name: p.name,
        date: p.date || values.date,
        time: p.time || values.time,
      };
      renderCertificate(off, image, fields, v, null);
      const dataUrl = off.toDataURL("image/jpeg", 0.95);
      if (idx > 0) pdf.addPage([image.width, image.height], orientation);
      pdf.addImage(dataUrl, "JPEG", 0, 0, image.width, image.height);
    });

    return pdf;
  }

  function downloadSingle() {
    const pdf = buildPdf([values]);
    if (!pdf) return;
    pdf.save(`certificado-${values.name.replace(/\s+/g, "_")}.pdf`);
  }

  function parseParticipants() {
    return participantList
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, date, time] = line.split(/\s*[;,|\t]\s*/);
        return { name, date, time };
      });
  }

  async function downloadBatch() {
    const list = parseParticipants();
    if (list.length === 0 || !image) return;
    setGenerating(true);
    try {
      await new Promise((r) => setTimeout(r, 30));
      const zip = new JSZip();
      for (const p of list) {
        const pdf = buildPdf([p]);
        if (!pdf) continue;
        const blob = pdf.output("blob");
        const safe = p.name.replace(/\s+/g, "_").replace(/[^\w.-]/g, "");
        zip.file(`certificado-${safe}.pdf`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificados-lote-${list.length}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  }

  const f = fields[selected];
  const participantCount = parseParticipants().length;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Gerador de Certificados</h1>
          <p className="text-muted-foreground">
            Faça upload de uma imagem, posicione os campos e gere PDFs individuais ou em lote.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <Card className="p-5 space-y-5 h-fit">
            <div>
              <Label htmlFor="upload" className="mb-2 block">Imagem do certificado</Label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input bg-secondary px-4 py-6 text-sm hover:bg-accent">
                <Upload className="h-4 w-4" />
                {image ? "Trocar imagem" : "Selecionar imagem"}
                <input id="upload" type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              </label>
            </div>

            <div className="space-y-3">
              <Label>Valores (preview)</Label>
              {(Object.keys(values) as FieldKey[]).map((k) => (
                <div key={k}>
                  <Label className="text-xs text-muted-foreground">{FIELD_LABELS[k]}</Label>
                  <Input
                    value={values[k]}
                    onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                    onFocus={() => setSelected(k)}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-3 border-t pt-4">
              <Label>Campo selecionado: {FIELD_LABELS[selected]}</Label>
              <Button
                variant={placingMode ? "default" : "outline"}
                className="w-full"
                onClick={() => setPlacingMode((p) => !p)}
                disabled={!image}
              >
                <MousePointer2 className="mr-2 h-4 w-4" />
                {placingMode ? "Clique na imagem..." : "Posicionar clicando"}
              </Button>
              <p className="text-xs text-muted-foreground">Ou arraste o campo diretamente na imagem.</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Tamanho</Label>
                  <Input
                    type="number"
                    value={f.fontSize}
                    onChange={(e) =>
                      setFields((p) => ({ ...p, [selected]: { ...p[selected], fontSize: +e.target.value } }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Cor</Label>
                  <Input
                    type="color"
                    value={f.color}
                    onChange={(e) =>
                      setFields((p) => ({ ...p, [selected]: { ...p[selected], color: e.target.value } }))
                    }
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Fonte</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={f.fontFamily}
                  onChange={(e) =>
                    setFields((p) => ({ ...p, [selected]: { ...p[selected], fontFamily: e.target.value } }))
                  }
                >
                  <option value="serif">Serif</option>
                  <option value="sans-serif">Sans-serif</option>
                  <option value="'Times New Roman', serif">Times New Roman</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="'Courier New', monospace">Courier</option>
                  <option value="cursive">Cursive</option>
                </select>
              </div>
            </div>

            <Button onClick={downloadSingle} disabled={!image} className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Baixar PDF (atual)
            </Button>
          </Card>

          <div className="space-y-6">
            <Card className="overflow-hidden p-4">
              {image ? (
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                  className={`w-full h-auto rounded ${placingMode ? "cursor-crosshair" : "cursor-move"}`}
                />
              ) : (
                <div className="flex aspect-[1.414/1] items-center justify-center rounded border border-dashed border-input text-muted-foreground">
                  Faça upload de uma imagem para começar
                </div>
              )}
            </Card>

            <Card className="p-5 space-y-3">
              <div>
                <Label className="text-base font-semibold">Geração em lote</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Um participante por linha. Formato: <code>Nome</code> ou{" "}
                  <code>Nome; Data; Hora</code> (separadores aceitos: <code>;</code> <code>,</code>{" "}
                  <code>|</code>). Data e Hora são opcionais — se omitidos, usa os valores do preview.
                </p>
              </div>
              <Textarea
                rows={6}
                placeholder={"Maria Silva\nJoão Souza; 15/05/2026; 19:30\nAna Costa, 20/05/2026"}
                value={participantList}
                onChange={(e) => setParticipantList(e.target.value)}
                className="font-mono text-sm"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {participantCount} participante{participantCount === 1 ? "" : "s"} detectado
                  {participantCount === 1 ? "" : "s"}
                </span>
                <Button onClick={downloadBatch} disabled={!image || participantCount === 0 || generating}>
                  <FileDown className="mr-2 h-4 w-4" />
                  {generating ? "Gerando..." : "Gerar PDF do lote"}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
