import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const prismaClientDir = path.join(root, 'node_modules', '@prisma', 'client');
const prismaOutDir = path.join(root, 'node_modules', '.prisma');
const linkPath = path.join(prismaClientDir, '.prisma');

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const expected = path.join(linkPath, 'client', 'default.js');
  if (await exists(expected)) {
    return;
  }

  if (!(await exists(prismaOutDir))) {
    throw new Error(
      'Prisma output directory not found at node_modules/.prisma. Run `npm -w @rozga/api run prisma:generate` first.',
    );
  }

  // Ensure target dir exists
  await fs.mkdir(prismaClientDir, { recursive: true });

  // Remove any stale path
  if (await exists(linkPath)) {
    await fs.rm(linkPath, { recursive: true, force: true });
  }

  // On Windows, using junction avoids admin-required symlinks.
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  const relativeTarget = path.relative(prismaClientDir, prismaOutDir);
  await fs.symlink(relativeTarget, linkPath, type);

  if (!(await exists(expected))) {
    throw new Error('Failed to link Prisma client runtime/types into @prisma/client/.prisma');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
