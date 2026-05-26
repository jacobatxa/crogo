from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class KBStats(BaseModel):
    chunk_count: int = 0
    document_count: int = 0
    project_count: int = 0


class IngestJobResponse(BaseModel):
    job_id: str
    status: Literal["processing", "done", "error"]
    file_count: int = 0
    chunk_count: int = 0
    message: str = ""


class IngestJobStatus(BaseModel):
    job_id: str
    status: Literal["processing", "done", "error"]
    file_count: int = 0
    chunk_count: int = 0
    message: str = ""


class FieldValue(BaseModel):
    key: str
    label: str
    value: str = ""
    confidence: float = 0.0
    source_snippet: str = ""
    required: bool = True


class ProjectCreateResponse(BaseModel):
    id: int
    name: str
    status: str


class ProjectOut(BaseModel):
    id: int
    name: str
    sponsor: str = ""
    template_id: Optional[int] = None
    template_ids: List[int] = Field(default_factory=list)
    status: str
    updated_at: str
    has_output: bool = False


class ProjectGenerationOut(BaseModel):
    template_id: int
    template_name: str = ""
    template_type: str = ""
    status: str = "pending"
    message: str = ""
    download_url: str = ""


class ProjectDetail(ProjectOut):
    fields: List[FieldValue] = Field(default_factory=list)
    pdf_filename: str = ""
    generations: List[ProjectGenerationOut] = Field(default_factory=list)


class TemplateOut(BaseModel):
    id: int
    type: str
    name: str
    desc: str = ""
    sections: int = 0
    placeholders: int = 0
    updated: str
    mappings_complete: bool = False


class PlaceholderOut(BaseModel):
    name: str
    context: str = ""


class SectionOut(BaseModel):
    level: int
    title: str
    number: str = ""


class TemplateDetailOut(TemplateOut):
    sections_list: List[SectionOut] = Field(default_factory=list)
    placeholders_list: List[PlaceholderOut] = Field(default_factory=list)
    mappings: Dict[str, str] = Field(default_factory=dict)


class MappingUpdate(BaseModel):
    mappings: Dict[str, str]


class SearchResult(BaseModel):
    text: str
    source: str
    score: float = 0.0


class GenerateResponse(BaseModel):
    success: bool
    message: str = ""
    download_url: str = ""
    generations: List[ProjectGenerationOut] = Field(default_factory=list)
