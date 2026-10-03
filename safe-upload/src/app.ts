import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { detectarImagem } from "./image-type.js";
import { caminhoSeguro } from "./paths.js";

export const LIMITE_BYTES = 2 * 1024 * 1024;

interface Arquivo {
  id: string;
  dono: string;
  caminho: string;
  mime: string;
  tamanho: number;
}

const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createApp(pastaUploads: string) {
  const app = express();
  const arquivos = new Map<string, Arquivo>();

  // O arquivo fica na memória até passar nas checagens; só depois vai para o disco.
  // fileSize faz o multer parar de ler assim que passa do limite.
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITE_BYTES, files: 1 } });

  // Neste exemplo o usuário vem do cabeçalho X-User-Id. Num sistema real
  // viria da sessão de login; o importante é ele vir do servidor e nunca
  // de um campo que o próprio cliente escolhe no corpo da requisição.
  function exigirUsuario(req: Request, res: Response, next: NextFunction) {
    const id = req.header("x-user-id");
    if (!id || !USER_ID.test(id)) {
      res.status(401).json({ error: "Usuário não identificado" });
      return;
    }
    res.locals.usuario = id;
    next();
  }

  /** Só devolve o arquivo se ele existir E for do usuário. Senão, 404 nos dois casos. */
  function arquivoDoUsuario(req: Request, res: Response): Arquivo | undefined {
    const id = String(req.params.id);
    const arquivo = UUID.test(id) ? arquivos.get(id) : undefined;
    if (!arquivo || arquivo.dono !== res.locals.usuario) {
      res.status(404).json({ error: "Arquivo não encontrado" });
      return undefined;
    }
    return arquivo;
  }

  app.post("/files", exigirUsuario, upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Envie o arquivo no campo 'file'" });
        return;
      }
      const tipo = detectarImagem(req.file.buffer);
      if (!tipo) {
        res.status(415).json({ error: "Só aceitamos PNG, JPEG ou WebP" });
        return;
      }

      // O nome no disco é gerado aqui. O nome original não entra no caminho.
      const id = randomUUID();
      const pasta = caminhoSeguro(pastaUploads, res.locals.usuario);
      const caminho = caminhoSeguro(pasta, `${id}.${tipo.ext}`);
      await mkdir(pasta, { recursive: true });
      await writeFile(caminho, req.file.buffer, { flag: "wx" });

      arquivos.set(id, { id, dono: res.locals.usuario, caminho, mime: tipo.mime, tamanho: req.file.size });
      res.status(201).json({ id, mime: tipo.mime, tamanho: req.file.size });
    } catch (e) {
      next(e);
    }
  });

  app.get("/files/:id", exigirUsuario, async (req, res, next) => {
    try {
      const arquivo = arquivoDoUsuario(req, res);
      if (!arquivo) return;
      res.setHeader("Content-Type", arquivo.mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(await readFile(arquivo.caminho));
    } catch (e) {
      next(e);
    }
  });

  app.delete("/files/:id", exigirUsuario, async (req, res, next) => {
    try {
      const arquivo = arquivoDoUsuario(req, res);
      if (!arquivo) return;
      await unlink(arquivo.caminho);
      arquivos.delete(arquivo.id);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: `Arquivo maior que ${LIMITE_BYTES / 1024 / 1024} MB` });
      return;
    }
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  });

  return app;
}
