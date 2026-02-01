<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Performance indexes untuk seluruh tabel
     */
    public function up(): void
    {
        // Users table indexes
        Schema::table('users', function (Blueprint $table) {
            $table->index('role', 'idx_users_role');
            $table->index('class_id', 'idx_users_class_id');
            $table->index(['role', 'class_id'], 'idx_users_role_class');
        });

        // Classes table indexes
        Schema::table('classes', function (Blueprint $table) {
            $table->index('grade_level', 'idx_classes_grade_level');
            $table->index('academic_year', 'idx_classes_academic_year');
        });

        // Attendance Sessions indexes
        Schema::table('attendance_sessions', function (Blueprint $table) {
            $table->index('class_id', 'idx_attendance_sessions_class_id');
            $table->index('teacher_id', 'idx_attendance_sessions_teacher_id');
            $table->index('status', 'idx_attendance_sessions_status');
            $table->index('valid_from', 'idx_attendance_sessions_valid_from');
            $table->index(['class_id', 'status'], 'idx_attendance_sessions_active');
        });

        // Attendances table indexes
        Schema::table('attendances', function (Blueprint $table) {
            $table->index('session_id', 'idx_attendances_session_id');
            $table->index('student_id', 'idx_attendances_student_id');
            $table->index('status', 'idx_attendances_status');
        });

        // Exams table indexes
        Schema::table('exams', function (Blueprint $table) {
            $table->index('class_id', 'idx_exams_class_id');
            $table->index('teacher_id', 'idx_exams_teacher_id');
            $table->index('status', 'idx_exams_status');
            $table->index(['class_id', 'status'], 'idx_exams_class_status');
            $table->index('start_time', 'idx_exams_start_time');
            $table->index(['start_time', 'end_time'], 'idx_exams_time_range');
        });

        // Questions table indexes
        Schema::table('questions', function (Blueprint $table) {
            $table->index('exam_id', 'idx_questions_exam_id');
            $table->index(['exam_id', 'order'], 'idx_questions_exam_order');
        });

        // Answers table indexes
        Schema::table('answers', function (Blueprint $table) {
            $table->index('exam_id', 'idx_answers_exam_id');
            $table->index('student_id', 'idx_answers_student_id');
            $table->index('question_id', 'idx_answers_question_id');
            $table->index(['exam_id', 'student_id'], 'idx_answers_exam_student');
        });

        // Exam Results indexes
        Schema::table('exam_results', function (Blueprint $table) {
            $table->index('exam_id', 'idx_exam_results_exam_id');
            $table->index('student_id', 'idx_exam_results_student_id');
            $table->index('status', 'idx_exam_results_status');
            $table->index(['exam_id', 'student_id'], 'idx_exam_results_exam_student');
            $table->index(['exam_id', 'status'], 'idx_exam_results_exam_status');
        });

        // Materials table indexes
        Schema::table('materials', function (Blueprint $table) {
            $table->index('class_id', 'idx_materials_class_id');
            $table->index('teacher_id', 'idx_materials_teacher_id');
            $table->index('subject', 'idx_materials_subject');
        });

        // Schedules table indexes
        Schema::table('schedules', function (Blueprint $table) {
            $table->index('class_id', 'idx_schedules_class_id');
            $table->index('teacher_id', 'idx_schedules_teacher_id');
            $table->index('day', 'idx_schedules_day');
            $table->index(['class_id', 'day'], 'idx_schedules_class_day');
        });

        // Violations table indexes (based on actual schema: exam_id, student_id)
        Schema::table('violations', function (Blueprint $table) {
            $table->index('student_id', 'idx_violations_student_id');
            $table->index('exam_id', 'idx_violations_exam_id');
        });

        // Monitoring Snapshots indexes (based on actual schema: user_id, exam_id, session_id)
        Schema::table('monitoring_snapshots', function (Blueprint $table) {
            $table->index('user_id', 'idx_monitoring_user_id');
            $table->index('exam_id', 'idx_monitoring_exam_id');
            $table->index('session_id', 'idx_monitoring_session_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Users table
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('idx_users_role');
            $table->dropIndex('idx_users_class_id');
            $table->dropIndex('idx_users_role_class');
        });

        // Classes table
        Schema::table('classes', function (Blueprint $table) {
            $table->dropIndex('idx_classes_grade_level');
            $table->dropIndex('idx_classes_academic_year');
        });

        // Attendance Sessions
        Schema::table('attendance_sessions', function (Blueprint $table) {
            $table->dropIndex('idx_attendance_sessions_class_id');
            $table->dropIndex('idx_attendance_sessions_teacher_id');
            $table->dropIndex('idx_attendance_sessions_status');
            $table->dropIndex('idx_attendance_sessions_valid_from');
            $table->dropIndex('idx_attendance_sessions_active');
        });

        // Attendances
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropIndex('idx_attendances_session_id');
            $table->dropIndex('idx_attendances_student_id');
            $table->dropIndex('idx_attendances_status');
        });

        // Exams
        Schema::table('exams', function (Blueprint $table) {
            $table->dropIndex('idx_exams_class_id');
            $table->dropIndex('idx_exams_teacher_id');
            $table->dropIndex('idx_exams_status');
            $table->dropIndex('idx_exams_class_status');
            $table->dropIndex('idx_exams_start_time');
            $table->dropIndex('idx_exams_time_range');
        });

        // Questions
        Schema::table('questions', function (Blueprint $table) {
            $table->dropIndex('idx_questions_exam_id');
            $table->dropIndex('idx_questions_exam_order');
        });

        // Answers
        Schema::table('answers', function (Blueprint $table) {
            $table->dropIndex('idx_answers_exam_id');
            $table->dropIndex('idx_answers_student_id');
            $table->dropIndex('idx_answers_question_id');
            $table->dropIndex('idx_answers_exam_student');
        });

        // Exam Results
        Schema::table('exam_results', function (Blueprint $table) {
            $table->dropIndex('idx_exam_results_exam_id');
            $table->dropIndex('idx_exam_results_student_id');
            $table->dropIndex('idx_exam_results_status');
            $table->dropIndex('idx_exam_results_exam_student');
            $table->dropIndex('idx_exam_results_exam_status');
        });

        // Materials
        Schema::table('materials', function (Blueprint $table) {
            $table->dropIndex('idx_materials_class_id');
            $table->dropIndex('idx_materials_teacher_id');
            $table->dropIndex('idx_materials_subject');
        });

        // Schedules
        Schema::table('schedules', function (Blueprint $table) {
            $table->dropIndex('idx_schedules_class_id');
            $table->dropIndex('idx_schedules_teacher_id');
            $table->dropIndex('idx_schedules_day');
            $table->dropIndex('idx_schedules_class_day');
        });

        // Violations
        Schema::table('violations', function (Blueprint $table) {
            $table->dropIndex('idx_violations_student_id');
            $table->dropIndex('idx_violations_exam_id');
        });

        // Monitoring Snapshots
        Schema::table('monitoring_snapshots', function (Blueprint $table) {
            $table->dropIndex('idx_monitoring_user_id');
            $table->dropIndex('idx_monitoring_exam_id');
            $table->dropIndex('idx_monitoring_session_id');
        });
    }
};
