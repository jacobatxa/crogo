from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"
    data_dir: Path = ROOT_DIR / "data"
    kb_top_k: int = 8
    chunk_size: int = 800
    chunk_overlap: int = 120

    @property
    def pdfs_dir(self) -> Path:
        return self.data_dir / "pdfs"

    @property
    def templates_dir(self) -> Path:
        return self.data_dir / "templates"

    @property
    def outputs_dir(self) -> Path:
        return self.data_dir / "outputs"

    @property
    def chroma_dir(self) -> Path:
        return self.data_dir / "chroma"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "crogo.db"


settings = Settings()

for d in (
    settings.data_dir,
    settings.pdfs_dir,
    settings.templates_dir,
    settings.outputs_dir,
    settings.chroma_dir,
):
    d.mkdir(parents=True, exist_ok=True)
