require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Firestore } = require('@google-cloud/firestore');
const sgMail = require('@sendgrid/mail');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize Firestore
const firestore = new Firestore({
  projectId: process.env.GCP_PROJECT_ID,
});
const questionsCollection = firestore.collection('questions');

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const APP_URL = process.env.APP_URL || 'https://faq-rfe-pa-1025620012992.europe-west1.run.app';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@faq-rfe.com';

// Simple admin password (in production, use proper auth)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ========== API ROUTES ==========

// Get all answered questions (public)
app.get('/api/questions', async (req, res) => {
  try {
    const snapshot = await questionsCollection
      .where('status', '==', 'answered')
      .orderBy('answeredAt', 'desc')
      .get();

    const questions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des questions' });
  }
});

// Get ALL questions - both pending and answered (public - for real-time board)
app.get('/api/questions/all', async (req, res) => {
  try {
    const snapshot = await questionsCollection.orderBy('createdAt', 'desc').get();

    const questions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(questions);
  } catch (error) {
    console.error('Error fetching all questions:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des questions' });
  }
});

// Submit a new question (public)
app.post('/api/questions', async (req, res) => {
  try {
    const { question, email, name } = req.body;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ error: 'La question est requise' });
    }

    const newQuestion = {
      question: question.trim(),
      email: email || null,
      name: name || 'Anonyme',
      status: 'pending',
      createdAt: new Date().toISOString(),
      answer: null,
      answeredAt: null
    };

    const docRef = await questionsCollection.add(newQuestion);

    // Send email notification to admin
    if (process.env.SENDGRID_API_KEY && ADMIN_EMAIL) {
      try {
        await sgMail.send({
          to: ADMIN_EMAIL,
          from: FROM_EMAIL,
          subject: 'Nouvelle question FAQ - Facturation Électronique',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0;">Nouvelle Question</h1>
              </div>
              <div style="padding: 30px; background: #f9f9f9;">
                <p><strong>De:</strong> ${name || 'Anonyme'} ${email ? `(<a href="mailto:${email}">${email}</a>)` : ''}</p>
                <p><strong>Question:</strong></p>
                <blockquote style="background: white; padding: 20px; border-left: 4px solid #667eea; margin: 15px 0;">
                  ${question}
                </blockquote>
                <p style="text-align: center; margin-top: 30px;">
                  <a href="${APP_URL}/admin.html" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">
                    Répondre à la question
                  </a>
                </p>
              </div>
            </div>
          `
        });
        console.log('Admin notification email sent');
      } catch (emailError) {
        console.error('Error sending admin email:', emailError);
      }
    }

    res.status(201).json({ id: docRef.id, message: 'Question soumise avec succès' });
  } catch (error) {
    console.error('Error submitting question:', error);
    res.status(500).json({ error: 'Erreur lors de la soumission de la question' });
  }
});

// ========== ADMIN ROUTES ==========

// Middleware for admin auth
const adminAuth = (req, res, next) => {
  const password = req.headers['x-admin-password'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  next();
};

// Get all questions (admin)
app.get('/api/admin/questions', adminAuth, async (req, res) => {
  try {
    const snapshot = await questionsCollection.orderBy('createdAt', 'desc').get();
    const questions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.json(questions);
  } catch (error) {
    console.error('Error fetching admin questions:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des questions' });
  }
});

// Answer a question (admin)
app.put('/api/admin/questions/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { answer } = req.body;

    if (!answer || answer.trim().length === 0) {
      return res.status(400).json({ error: 'La réponse est requise' });
    }

    // Get the question first to retrieve user email
    const questionDoc = await questionsCollection.doc(id).get();
    const questionData = questionDoc.data();

    await questionsCollection.doc(id).update({
      answer: answer.trim(),
      status: 'answered',
      answeredAt: new Date().toISOString()
    });

    // Send email notification to the user who asked the question
    if (process.env.SENDGRID_API_KEY && questionData.email) {
      try {
        await sgMail.send({
          to: questionData.email,
          from: FROM_EMAIL,
          subject: 'Votre question a reçu une réponse - FAQ Facturation Électronique',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0;">Réponse à votre question</h1>
              </div>
              <div style="padding: 30px; background: #f9f9f9;">
                <p>Bonjour ${questionData.name || ''},</p>
                <p>Votre question a reçu une réponse !</p>

                <p><strong>Votre question :</strong></p>
                <blockquote style="background: white; padding: 20px; border-left: 4px solid #667eea; margin: 15px 0;">
                  ${questionData.question}
                </blockquote>

                <p><strong>Réponse :</strong></p>
                <blockquote style="background: white; padding: 20px; border-left: 4px solid #28a745; margin: 15px 0;">
                  ${answer}
                </blockquote>

                <p style="text-align: center; margin-top: 30px;">
                  <a href="${APP_URL}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">
                    Voir toutes les FAQ
                  </a>
                </p>

                <p style="color: #888; font-size: 12px; margin-top: 30px; text-align: center;">
                  FAQ Facturation Électronique & Plateformes Agréées
                </p>
              </div>
            </div>
          `
        });
        console.log('User notification email sent to:', questionData.email);
      } catch (emailError) {
        console.error('Error sending user email:', emailError);
      }
    }

    res.json({ message: 'Réponse enregistrée avec succès' });
  } catch (error) {
    console.error('Error answering question:', error);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la réponse' });
  }
});

// Delete a question (admin)
app.delete('/api/admin/questions/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await questionsCollection.doc(id).delete();
    res.json({ message: 'Question supprimée' });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// Verify admin password
app.post('/api/admin/verify', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ valid: true });
  } else {
    res.status(401).json({ valid: false });
  }
});

// ========== EXPORT API ==========

// Export all data as JSON (admin only)
app.get('/api/admin/export', adminAuth, async (req, res) => {
  try {
    const snapshot = await questionsCollection.orderBy('createdAt', 'desc').get();
    const questions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=faq-export-${new Date().toISOString().split('T')[0]}.json`);
    res.json({
      exportDate: new Date().toISOString(),
      totalQuestions: questions.length,
      answeredCount: questions.filter(q => q.status === 'answered').length,
      pendingCount: questions.filter(q => q.status === 'pending').length,
      questions: questions
    });
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Erreur lors de l\'export' });
  }
});

// Export as CSV (admin only)
app.get('/api/admin/export/csv', adminAuth, async (req, res) => {
  try {
    const snapshot = await questionsCollection.orderBy('createdAt', 'desc').get();
    const questions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // CSV Header
    let csv = 'ID,Nom,Email,Question,Statut,Date Question,Réponse,Date Réponse\n';

    // CSV Rows
    questions.forEach(q => {
      const row = [
        q.id,
        `"${(q.name || '').replace(/"/g, '""')}"`,
        `"${(q.email || '').replace(/"/g, '""')}"`,
        `"${(q.question || '').replace(/"/g, '""')}"`,
        q.status,
        q.createdAt || '',
        `"${(q.answer || '').replace(/"/g, '""')}"`,
        q.answeredAt || ''
      ];
      csv += row.join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=faq-export-${new Date().toISOString().split('T')[0]}.csv`);
    res.send('\uFEFF' + csv); // BOM for Excel compatibility
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Erreur lors de l\'export CSV' });
  }
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 FAQ Server running on port ${PORT}`);
  console.log(`📖 Public FAQ: http://localhost:${PORT}`);
  console.log(`🔐 Admin panel: http://localhost:${PORT}/admin.html`);
});
