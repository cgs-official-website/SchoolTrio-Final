import { prisma } from '../../database/prisma.client.js';

/**
 * Library Data Access Repository Layer
 *
 * Enforces strict multi-tenant scoping on every database query and mutation.
 */

// ==========================================
// 1. Category Repository Methods
// ==========================================

export async function findCategoriesBySchoolId(schoolId, tx = prisma) {
  return tx.libraryCategory.findMany({
    where: { schoolId },
    orderBy: { name: 'asc' }
  });
}

export async function findCategoryById(schoolId, categoryId, tx = prisma) {
  return tx.libraryCategory.findFirst({
    where: {
      id: categoryId,
      schoolId
    }
  });
}

export async function findCategoryByName(schoolId, name, tx = prisma) {
  return tx.libraryCategory.findFirst({
    where: {
      schoolId,
      name: {
        equals: name.trim(),
        mode: 'insensitive'
      }
    }
  });
}

export async function createCategory(data, tx = prisma) {
  return tx.libraryCategory.create({
    data: {
      schoolId: data.schoolId,
      name: data.name.trim()
    }
  });
}

// ==========================================
// 2. Book Repository Methods
// ==========================================

export async function findBooks(schoolId, options = {}, tx = prisma) {
  const {
    search,
    categoryId,
    category,
    availableOnly,
    page = 1,
    limit = 20
  } = options;

  const where = { schoolId };

  if (categoryId) {
    where.categoryId = categoryId;
  }

  if (category) {
    where.category = {
      contains: category.trim(),
      mode: 'insensitive'
    };
  }

  if (availableOnly) {
    where.availableQuantity = { gt: 0 };
  }

  if (search && search.trim()) {
    const term = search.trim();
    where.OR = [
      { title: { contains: term, mode: 'insensitive' } },
      { author: { contains: term, mode: 'insensitive' } },
      { isbn: { contains: term, mode: 'insensitive' } }
    ];
  }

  const skip = (page - 1) * limit;

  const [total, data] = await Promise.all([
    tx.libraryBook.count({ where }),
    tx.libraryBook.findMany({
      where,
      include: {
        libraryCategory: {
          select: {
            id: true,
            name: true
          }
        },
        _count: {
          select: {
            issues: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    })
  ]);

  return { total, data };
}

export async function findBookById(schoolId, bookId, tx = prisma) {
  return tx.libraryBook.findFirst({
    where: {
      id: bookId,
      schoolId
    },
    include: {
      libraryCategory: {
        select: {
          id: true,
          name: true
        }
      },
      _count: {
        select: {
          issues: true
        }
      }
    }
  });
}

export async function createBook(data, tx = prisma) {
  return tx.libraryBook.create({
    data: {
      schoolId: data.schoolId,
      title: data.title.trim(),
      author: data.author ? data.author.trim() : null,
      isbn: data.isbn ? data.isbn.trim() : null,
      category: data.category ? data.category.trim() : null,
      categoryId: data.categoryId || null,
      totalQuantity: data.totalQuantity,
      availableQuantity: data.totalQuantity,
      customData: data.customData ?? undefined
    },
    include: {
      libraryCategory: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

export async function updateBook(schoolId, bookId, data, tx = prisma) {
  return tx.libraryBook.update({
    where: {
      schoolId_id: {
        schoolId,
        id: bookId
      }
    },
    data,
    include: {
      libraryCategory: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

export async function deleteBook(schoolId, bookId, tx = prisma) {
  return tx.libraryBook.delete({
    where: {
      schoolId_id: {
        schoolId,
        id: bookId
      }
    }
  });
}

export async function countBookIssues(schoolId, bookId, tx = prisma) {
  return tx.libraryBookIssue.count({
    where: {
      schoolId,
      bookId
    }
  });
}

export async function countActiveBookIssues(schoolId, bookId, tx = prisma) {
  return tx.libraryBookIssue.count({
    where: {
      schoolId,
      bookId,
      status: 'issued'
    }
  });
}

export async function decrementBookAvailableQuantityAtomic(schoolId, bookId, tx = prisma) {
  const result = await tx.libraryBook.updateMany({
    where: {
      id: bookId,
      schoolId,
      availableQuantity: { gt: 0 }
    },
    data: {
      availableQuantity: { decrement: 1 }
    }
  });
  return result.count;
}

export async function incrementBookAvailableQuantityAtomic(schoolId, bookId, tx = prisma) {
  const result = await tx.libraryBook.updateMany({
    where: {
      id: bookId,
      schoolId
    },
    data: {
      availableQuantity: { increment: 1 }
    }
  });
  return result.count;
}

// ==========================================
// 3. Issue Repository Methods
// ==========================================

export async function findIssues(schoolId, options = {}, tx = prisma) {
  const {
    status,
    bookId,
    studentId,
    overdue,
    search,
    page = 1,
    limit = 20
  } = options;

  const where = { schoolId };

  if (status) {
    where.status = status;
  }

  if (bookId) {
    where.bookId = bookId;
  }

  if (studentId) {
    where.studentId = studentId;
  }

  const currentDateStr = new Date().toISOString().split('T')[0];

  if (overdue) {
    where.status = 'issued';
    where.dueDate = { lt: currentDateStr };
  }

  if (search && search.trim()) {
    const term = search.trim();
    where.OR = [
      { book: { title: { contains: term, mode: 'insensitive' } } },
      { student: { firstName: { contains: term, mode: 'insensitive' } } },
      { student: { lastName: { contains: term, mode: 'insensitive' } } },
      { student: { admissionNumber: { contains: term, mode: 'insensitive' } } }
    ];
  }

  const skip = (page - 1) * limit;

  const [total, data] = await Promise.all([
    tx.libraryBookIssue.count({ where }),
    tx.libraryBookIssue.findMany({
      where,
      include: {
        book: {
          select: {
            id: true,
            title: true,
            author: true,
            isbn: true,
            category: true,
            availableQuantity: true,
            totalQuantity: true
          }
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            classId: true,
            class: {
              select: {
                id: true,
                name: true
              }
            },
            section: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: { issuedAt: 'desc' },
      skip,
      take: limit
    })
  ]);

  return { total, data };
}

export async function findIssueById(schoolId, issueId, tx = prisma) {
  return tx.libraryBookIssue.findFirst({
    where: {
      id: issueId,
      schoolId
    },
    include: {
      book: {
        select: {
          id: true,
          title: true,
          author: true,
          isbn: true,
          category: true,
          availableQuantity: true,
          totalQuantity: true
        }
      },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          classId: true,
          class: {
            select: {
              id: true,
              name: true
            }
          },
          section: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  });
}

export async function createIssue(data, tx = prisma) {
  return tx.libraryBookIssue.create({
    data: {
      schoolId: data.schoolId,
      bookId: data.bookId,
      studentId: data.studentId,
      issuedAt: data.issuedAt || new Date(),
      dueDate: data.dueDate,
      status: 'issued',
      fineAmount: 0
    },
    include: {
      book: {
        select: {
          id: true,
          title: true,
          author: true,
          isbn: true
        }
      },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true
        }
      }
    }
  });
}

export async function markIssueReturned(schoolId, issueId, tx = prisma) {
  const result = await tx.libraryBookIssue.updateMany({
    where: {
      id: issueId,
      schoolId,
      status: 'issued'
    },
    data: {
      status: 'returned',
      returnedAt: new Date()
    }
  });
  return result.count;
}

// Student existence helper within tenant
export async function findStudentById(schoolId, studentId, tx = prisma) {
  return tx.student.findFirst({
    where: {
      id: studentId,
      schoolId
    },
    select: {
      id: true,
      schoolId: true,
      status: true,
      firstName: true,
      lastName: true,
      admissionNumber: true
    }
  });
}
