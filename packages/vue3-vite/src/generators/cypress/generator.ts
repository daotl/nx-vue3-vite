import {
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  names,
  offsetFromRoot,
  Tree,
  joinPathFragments,
} from '@nrwl/devkit';
import { addPackageWithInit } from '@nrwl/workspace';
import { runTasksInSerial } from '@nrwl/workspace/src/utilities/run-tasks-in-serial';
import * as path from 'path';
import { CypressGeneratorSchema } from './schema';
import { CypressDevDependencies } from '../../defaults';
import { updateDependencies } from '../../utils';

interface NormalizedSchema extends CypressGeneratorSchema {
  targetProject?: string;
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  parsedTags: string[];
}

function normalizeOptions(
  host: Tree,
  options: CypressGeneratorSchema
): NormalizedSchema {
  if (!options.name && !options.project) {
    throw new Error('A name or a project is required');
  }
  const name = names(options.name || `${options.project}-e2e`).fileName;
  const projectDirectory = options.directory
    ? names(options.directory).fileName
    : name;
  const projectRoot = joinPathFragments(
    getWorkspaceLayout(host).appsDir,
    projectDirectory
  );
  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim())
    : [];

  return {
    ...options,
    targetProject: options.project,
    projectName: name,
    projectRoot,
    projectDirectory,
    parsedTags,
  };
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...names(options.projectName),
    offsetFromRoot: offsetFromRoot(options.projectRoot),
    // Hack for copying dotfiles - use as a template in the filename
    // e.g. "__dot__eslintrc.js" => ".eslintrc.js"
    dot: '.',
    template: '',
  };
  generateFiles(
    host,
    path.join(__dirname, 'files'),
    options.projectRoot,
    templateOptions
  );
}

export default async function (host: Tree, options: CypressGeneratorSchema) {
  const normalizedOptions = normalizeOptions(host, options);
  const { projectRoot, projectName, targetProject } = normalizedOptions;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e2eTarget: any = {
    executor: 'nx-vue3-vite:cypress',
    options: {
      cypressConfig: joinPathFragments(projectRoot, 'cypress.json'),
    },
  };
  if (targetProject) {
    e2eTarget.options.devServerTarget = `${targetProject}:serve`;
    e2eTarget.configurations = {
      production: { devServerTarget: `${projectName}:serve:production` },
    };
  }

  addProjectConfiguration(host, normalizedOptions.projectName, {
    root: projectRoot,
    projectType: 'application',
    sourceRoot: joinPathFragments(projectRoot, 'src'),
    targets: {
      e2e: e2eTarget,
      lint: {
        executor: '@nrwl/linter:eslint',
        options: {
          lintFilePatterns: [`${projectRoot}/**/*.{js,jsx,ts,tsx,vue}`],
        },
      },
    },
    tags: normalizedOptions.parsedTags,
  });
  const depsTask = updateDependencies(host, {}, CypressDevDependencies);

  addFiles(host, normalizedOptions);

  addPackageWithInit('@nrwl/jest');
  await formatFiles(host);

  return runTasksInSerial(depsTask);
}
