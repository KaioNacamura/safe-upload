import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, LIMITE_BYTES } from "../src/app.js";
import { caminhoSeguro, estaDentro, estaDentroIngenuo } from "../src/paths.js";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);

let pasta: string;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "safe-upload-"));
  app = createApp(pasta);
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

function enviar(usuario: string, conteudo: Buffer, nome = "foto.png") {
  return request(app).post("/files").set("X-User-Id", usuario).attach("file", conteudo, nome);
}

describe("fronteira de pasta", () => {
  const base = path.resolve("/dados/uploads");

  it("startsWith deixa passar uma pasta vizinha com nome parecido", () => {
    const vizinha = path.resolve("/dados/uploads-falso/x.png");
    expect(estaDentroIngenuo(base, vizinha)).toBe(true); // o erro
    expect(estaDentro(base, vizinha)).toBe(false); // o certo
  });

  it("recusa ../ e caminho absoluto", () => {
    expect(() => caminhoSeguro(base, "../segredos.txt")).toThrow();
    expect(() => caminhoSeguro(base, "ana", "..", "..", "etc")).toThrow();
    expect(() => caminhoSeguro(base, path.resolve("/etc/passwd"))).toThrow();
  });

  it("aceita caminho dentro da pasta", () => {
    expect(caminhoSeguro(base, "ana", "foto.png")).toBe(path.join(base, "ana", "foto.png"));
  });
});

describe("envio", () => {
  it("aceita PNG e JPEG", async () => {
    const png = await enviar("ana", PNG).expect(201);
    const jpg = await enviar("ana", JPEG, "foto.jpg").expect(201);
    expect(png.body.mime).toBe("image/png");
    expect(jpg.body.mime).toBe("image/jpeg");
  });

  it("recusa arquivo que diz ser PNG mas não é", async () => {
    const falso = Buffer.from("<script>alert(1)</script>");
    await request(app)
      .post("/files")
      .set("X-User-Id", "ana")
      .attach("file", falso, { filename: "foto.png", contentType: "image/png" })
      .expect(415);
  });

  it("recusa arquivo acima do limite com 413", async () => {
    const grande = Buffer.concat([PNG, Buffer.alloc(LIMITE_BYTES)]);
    await enviar("ana", grande).expect(413);
  });

  it("nome original com ../ não escapa da pasta", async () => {
    await enviar("ana", PNG, "../../../fora.png").expect(201);
    const dentro = await readdir(path.join(pasta, "ana"));
    expect(dentro).toHaveLength(1);
    expect(dentro[0]).toMatch(/^[0-9a-f-]{36}\.png$/);
  });

  it("usuário com ../ no id é recusado", async () => {
    await enviar("../outro", PNG).expect(401);
  });
});

describe("dono do arquivo", () => {
  it("o dono baixa e apaga", async () => {
    const { body } = await enviar("ana", PNG).expect(201);
    const baixado = await request(app).get(`/files/${body.id}`).set("X-User-Id", "ana").expect(200);
    expect(baixado.headers["x-content-type-options"]).toBe("nosniff");
    await request(app).delete(`/files/${body.id}`).set("X-User-Id", "ana").expect(204);
    await request(app).get(`/files/${body.id}`).set("X-User-Id", "ana").expect(404);
  });

  it("outro usuário recebe 404, como se o arquivo não existisse", async () => {
    const { body } = await enviar("ana", PNG).expect(201);
    await request(app).get(`/files/${body.id}`).set("X-User-Id", "bruno").expect(404);
    await request(app).delete(`/files/${body.id}`).set("X-User-Id", "bruno").expect(404);
    await request(app).get(`/files/${body.id}`).set("X-User-Id", "ana").expect(200);
  });
});
