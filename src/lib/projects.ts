import yaml from 'js-yaml';
import fs from 'node:fs';
import path from 'node:path';

export interface ProjectMedia {
  type: 'video' | 'image';
  src: string;
  label?: string;
}

export interface Project {
  id: string;
  title: string;
  shortDescription: string;
  description: string;
  logo: string | null;
  bgImage?: string | null;
  media: ProjectMedia[];
  technologies: string[];
  link?: string | null;
  repo?: string | null;
  featured?: boolean;
}

export function loadProjects(): Project[] {
  const projectsPath = path.join(process.cwd(), 'src/data/projects/projects.yaml');
  const data = yaml.load(fs.readFileSync(projectsPath, 'utf8')) as { projects: Project[] };
  return data.projects;
}
