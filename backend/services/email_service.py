import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import logging
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

SMTP_EMAIL = os.getenv("SMTP_EMAIL")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Initialize logger for email service
logger = logging.getLogger(__name__)

def _send_email(to_email: str, subject: str, html_body: str):
    """Low-level SMTP sender"""
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        logger.warning("SMTP credentials not configured. Skipping email to %s", to_email)
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"MedAssist <{SMTP_EMAIL}>"
        msg["To"] = to_email

        part = MIMEText(html_body, "html")
        msg.attach(part)

        # Connect to Gmail SMTP server
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.sendmail(SMTP_EMAIL, to_email, msg.as_string())
        server.quit()
        logger.info("Email sent successfully to %s", to_email)
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to_email, str(e))

def _get_base_template(content: str) -> str:
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #334155; }}
            .container {{ max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }}
            .header {{ background-color: #0f766e; padding: 20px; color: #ffffff; text-align: center; font-size: 24px; font-weight: bold; }}
            .header-cancel {{ background-color: #ea580c; }}
            .header-complete {{ background-color: #16a34a; }}
            .content {{ padding: 30px; }}
            .card {{ background-color: #f1f5f9; padding: 20px; border-radius: 6px; margin: 20px 0; }}
            .btn {{ display: inline-block; background-color: #0f766e; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }}
            .footer {{ background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; }}
            h2 {{ color: #0f172a; margin-top: 0; }}
            p {{ line-height: 1.6; margin-bottom: 15px; }}
        </style>
    </head>
    <body>
        {content}
    </body>
    </html>
    """

def _format_time(time_str: str) -> str:
    try:
        dt = datetime.strptime(time_str, "%H:%M")
        return dt.strftime("%I:%M %p").lstrip("0")
    except Exception:
        return time_str

def send_booking_confirmation(patient_email: str, doctor_email: str, details: dict):
    formatted_time = _format_time(details['time'])
    subject = f"✅ Appointment Confirmed — {details['date']} at {formatted_time}"
    
    html = _get_base_template(f"""
        <div class="container">
            <div class="header">➕ MedAssist</div>
            <div class="content">
                <h2>Appointment Confirmed!</h2>
                <div class="card">
                    <p><strong>Patient Name:</strong> {details['patient_name']}</p>
                    <p><strong>Doctor Name:</strong> {details['doctor_name']}</p>
                    <p><strong>Specialty:</strong> {details.get('specialty', 'General Practice')}</p>
                    <p><strong>Date:</strong> {details['date']}</p>
                    <p><strong>Time:</strong> {formatted_time}</p>
                    <p><strong>Status:</strong> Confirmed</p>
                </div>
                <p>Thank you for scheduling your appointment with Dr. {details['doctor_name'].split(' ')[-1]} at MedAssist. This email confirms that your consultation is successfully scheduled. We look forward to seeing you. Please arrive 15 minutes early to complete any necessary paperwork.</p>
                <a href="{FRONTEND_URL}/profile" class="btn">View My Appointments</a>
            </div>
            <div class="footer">
                © 2026 MedAssist, Inc. All rights reserved.<br>
                You are receiving this email because you scheduled an appointment with MedAssist.
            </div>
        </div>
    """)
    
    # Send to both patient and doctor
    _send_email(patient_email, subject, html)
    _send_email(doctor_email, subject, html)

def send_cancellation_notice(patient_email: str, doctor_email: str, details: dict):
    formatted_time = _format_time(details['time'])
    subject = f"❌ Appointment Cancelled — {details['date']} at {formatted_time}"
    
    html = _get_base_template(f"""
        <div class="container">
            <div class="header header-cancel">➕ MedAssist</div>
            <div class="content">
                <h2>Appointment Cancelled</h2>
                <div class="card">
                    <p><strong>Patient Name:</strong> {details['patient_name']}</p>
                    <p><strong>Doctor Name:</strong> {details['doctor_name']}</p>
                    <p><strong>Date:</strong> {details['date']}</p>
                    <p><strong>Time:</strong> {formatted_time}</p>
                    <p><strong>Status:</strong> Cancelled</p>
                </div>
                <p>This email is to notify you that the appointment scheduled for {details['date']} at {formatted_time} has been cancelled.</p>
                <a href="{FRONTEND_URL}" class="btn" style="background-color: #ea580c;">Book a New Appointment</a>
            </div>
            <div class="footer">
                © 2026 MedAssist, Inc. All rights reserved.
            </div>
        </div>
    """)
    
    _send_email(patient_email, subject, html)
    _send_email(doctor_email, subject, html)

def send_completion_summary(patient_email: str, details: dict):
    subject = f"📋 Appointment Summary — {details['doctor_name']}"
    
    html = _get_base_template(f"""
        <div class="container">
            <div class="header header-complete">➕ MedAssist</div>
            <div class="content">
                <h2>Appointment Complete</h2>
                <p>Your appointment with {details['doctor_name']} on {details['date']} is complete.</p>
                <div class="card">
                    <h3>Prescription / Doctor's Notes:</h3>
                    <p style="white-space: pre-wrap;">{details.get('prescription_notes') or 'No specific notes provided.'}</p>
                </div>
                <p>We hope you feel better soon! You can review your full consultation history on your dashboard.</p>
                <a href="{FRONTEND_URL}/profile" class="btn" style="background-color: #16a34a;">View Full History</a>
            </div>
            <div class="footer">
                © 2026 MedAssist, Inc. All rights reserved.
            </div>
        </div>
    """)
    
    _send_email(patient_email, subject, html)
