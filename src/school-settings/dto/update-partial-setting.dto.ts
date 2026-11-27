import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class UpdatePartialSettingDto {
  @ApiPropertyOptional({
    description: 'Map of section keys to their updated values for bulk or multi-section update',
    example: {
      header: {
        schoolName: 'Indian Public School',
        email: 'info@indianpublicschool.in',
        phone: '+91 8114320555',
        address: 'Main Road, Near RMC, Khetrajpur, Sambalpur, Odisha - 768006',
      },
      site_logo: {
        logoUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Logos/IPSLogo.png',
        logoText: 'Indian Public School',
        logoSubText: 'Learn · Lead · Inspire',
      },
    },
  })
  @IsOptional()
  updates?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Section key identifier when updating via section name',
    example: 'header',
  })
  @IsOptional()
  section?: string;

  @ApiPropertyOptional({
    description: 'Section payload value when updating with section key',
    example: {
      schoolName: 'Indian Public School',
      email: 'info@indianpublicschool.in',
      phone: '+91 8114320555',
    },
  })
  @IsOptional()
  value?: any;

  // Root-level section fields with complete samples
  @ApiPropertyOptional({
    description: 'School branding & logo configuration',
    example: {
      logoUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Logos/IPSLogo.png',
      secondaryLogoUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Logos/file_dvxond.png',
      showSecondaryLogo: false,
      logoText: 'Indian Public School',
      logoSubText: 'Learn · Lead · Inspire',
    },
  })
  @IsOptional()
  site_logo?: any;

  @ApiPropertyOptional({
    description: 'Global site header configuration',
    example: {
      schoolName: 'Indian Public School',
      email: 'info@indianpublicschool.in',
      phone: '+91 8114320555',
      address: 'Main Road, Near RMC, Khetrajpur, Sambalpur, Odisha - 768006',
      cbseAffiliationNo: '530152',
      schoolCode: '15389',
    },
  })
  @IsOptional()
  header?: any;

  @ApiPropertyOptional({
    description: 'Global site footer configuration',
    example: {
      copyrightText: '© 2026 Indian Public School. All rights reserved.',
      email: 'info@indianpublicschool.in',
      phone: '+91 8114320555',
      address: 'Main Road, Near RMC, Khetrajpur, Sambalpur, Odisha - 768006',
    },
  })
  @IsOptional()
  footer?: any;

  @ApiPropertyOptional({
    description: 'WhatsApp live chat widget settings',
    example: {
      enabled: true,
      phoneNumber: '+918114320555',
      defaultMessage: 'Hello! I have an inquiry regarding admission.',
      presetMessages: ['Admission Enquiry', 'Fee Structure', 'Campus Visit'],
    },
  })
  @IsOptional()
  whatsapp?: any;

  @ApiPropertyOptional({
    description: 'Announcement Pop-Up banner modal',
    example: {
      enabled: true,
      imageUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Home/PopUp.jpg',
      redirectUrl: '/admission',
      title: 'Admissions Open 2026-27',
      displayDelaySeconds: 2,
    },
  })
  @IsOptional()
  popupBanner?: any;

  @ApiPropertyOptional({
    description: 'Certified board badge and accreditation settings',
    example: {
      title: 'CBSE Affiliated',
      affiliationNumber: '530152',
      schoolCode: '15389',
      enabled: true,
    },
  })
  @IsOptional()
  certified_board?: any;

  @ApiPropertyOptional({
    description: 'Trust board card and management information',
    example: {
      title: 'Aakash Foundation',
      description: 'Nurturing Future Leaders',
      enabled: true,
    },
  })
  @IsOptional()
  trust_board?: any;

  @ApiPropertyOptional({
    description: 'Academic partner settings',
    example: {
      title: 'CBSE New Delhi',
      enabled: true,
    },
  })
  @IsOptional()
  academic_partner?: any;

  @ApiPropertyOptional({
    description: 'About Us page content',
    example: {
      title: 'About Indian Public School',
      overview: 'Founded to deliver comprehensive holistic education in Sambalpur, Odisha.',
    },
  })
  @IsOptional()
  aboutUs?: any;

  // Home section fields with complete samples
  @ApiPropertyOptional({
    description: 'Hero poster and slide banners configuration',
    example: {
      slides: [
        {
          bannerUrl: '/assets/Settings/Home/Hero-5.png',
          mobileBannerUrl: '',
          title: 'Empowering Minds, Shaping Futures',
          subtitle: 'CBSE Affiliated Excellence in Education from Pre-Primary to Class XII.',
          redirectUrl: '/admission',
        },
      ],
    },
  })
  @IsOptional()
  hero?: any;

  @ApiPropertyOptional({
    description: 'Quick access cards displayed on home page',
    example: [
      {
        heading: 'Admission Open',
        subHeading: 'Apply for 2026-27 session',
        redirectUrl: '/admission',
        iconUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Icons/Admission.png',
      },
      {
        heading: 'Curriculum & Academics',
        subHeading: 'Pre-Primary to Class XII',
        redirectUrl: '/#academics',
        iconUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Icons/Academics.png',
      },
    ],
  })
  @IsOptional()
  menuCard?: any;

  @ApiPropertyOptional({
    description: 'Alias for menuCard',
    example: [
      {
        heading: 'Admission Open',
        subHeading: 'Apply for 2026-27 session',
        redirectUrl: '/admission',
        iconUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Icons/Admission.png',
      },
    ],
  })
  @IsOptional()
  quickCards?: any;

  @ApiPropertyOptional({
    description: 'Introductory campus video section',
    example: [
      {
        heading: 'Experience Campus Life at IPS',
        videoUrl: '/Videos/file_feszan.mp4',
        posterUrl: '/assets/Settings/Home/hero-campus.png',
      },
    ],
  })
  @IsOptional()
  video?: any;

  @ApiPropertyOptional({
    description: 'Introductory campus video section',
    example: [
      {
        heading: 'Experience Campus Life at IPS',
        videoUrl: '/Videos/file_feszan.mp4',
      },
    ],
  })
  @IsOptional()
  'section-video'?: any;

  @ApiPropertyOptional({
    description: 'Section 1: About the School with CTA',
    example: [
      {
        heading: 'A Legacy of Excellence in Sambalpur',
        subHeading: 'Nurturing Global Citizens',
        description: 'IPS is committed to providing a holistic learning environment fostering intellectual growth.',
        btnLinkText: {
          show: true,
          text: 'Discover Our Story',
          url: '/about/school-establishment',
        },
      },
    ],
  })
  @IsOptional()
  sec1?: any;

  @ApiPropertyOptional({
    description: 'Section 1: About the School with CTA',
    example: [
      {
        heading: 'A Legacy of Excellence in Sambalpur',
        description: 'IPS is committed to providing a holistic learning environment fostering intellectual growth.',
        btnLinkText: {
          show: true,
          text: 'Discover Our Story',
          url: '/about/school-establishment',
        },
      },
    ],
  })
  @IsOptional()
  'section-1'?: any;

  @ApiPropertyOptional({
    description: 'Section 2: Key Milestones and Statistics',
    example: [
      { number: '1500+', label: 'Happy Students' },
      { number: '100%', label: 'CBSE Pass Rate' },
      { number: '60+', label: 'Expert Faculty' },
      { number: '10+', label: 'Acres Lush Campus' },
    ],
  })
  @IsOptional()
  sec2?: any;

  @ApiPropertyOptional({
    description: 'Section 2: Key Milestones and Statistics',
    example: [
      { number: '1500+', label: 'Happy Students' },
      { number: '100%', label: 'CBSE Pass Rate' },
    ],
  })
  @IsOptional()
  'section-2'?: any;

  @ApiPropertyOptional({
    description: 'Section 3: Why Choose IPS Feature Cards',
    example: [
      {
        heading: 'Holistic CBSE Curriculum',
        description: 'Balanced academic rigor and co-curricular enrichment programs.',
        icoUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Icons/Icon1.png',
        redirectUrl: '/about',
      },
      {
        heading: 'Modern Infrastructure',
        description: 'Smart classrooms, advanced science and computer laboratories.',
        icoUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Icons/Icon2.png',
        redirectUrl: '/about/infrastructure',
      },
    ],
  })
  @IsOptional()
  sec3?: any;

  @ApiPropertyOptional({
    description: 'Section 3: Why Choose IPS Feature Cards',
    example: [
      {
        heading: 'Holistic CBSE Curriculum',
        description: 'Balanced academic rigor and co-curricular enrichment programs.',
        icoUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Icons/Icon1.png',
      },
    ],
  })
  @IsOptional()
  'section-3'?: any;

  @ApiPropertyOptional({
    description: 'Section 4: Academics',
    example: [
      {
        heading: 'Academic Wings',
        description: 'Tailored pedagogical frameworks for Pre-Primary, Primary, Middle, and Senior wings.',
      },
    ],
  })
  @IsOptional()
  sec4?: any;

  @ApiPropertyOptional({
    description: 'Section 4: Academics',
    example: [
      {
        heading: 'Academic Wings',
        description: 'Tailored pedagogical frameworks.',
      },
    ],
  })
  @IsOptional()
  'section-4'?: any;

  @ApiPropertyOptional({
    description: 'Section 5',
    example: [],
  })
  @IsOptional()
  sec5?: any;

  @ApiPropertyOptional({
    description: 'Section 5',
    example: [],
  })
  @IsOptional()
  'section-5'?: any;

  @ApiPropertyOptional({
    description: 'Section 6: Campus & Infrastructure Gallery',
    example: [
      {
        title: 'Advanced Science Labs',
        description: 'Hands-on experiential learning in Physics, Chemistry, and Biology labs.',
        fileUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Home/Lab.jpg',
      },
      {
        title: 'Expansive Sports Complex',
        description: 'Dedicated courts for basketball, football, cricket, and athletics.',
        fileUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Home/Sports.jpg',
      },
    ],
  })
  @IsOptional()
  sec6?: any;

  @ApiPropertyOptional({
    description: 'Section 6: Campus & Infrastructure Gallery',
    example: [
      {
        title: 'Advanced Science Labs',
        description: 'Hands-on experiential learning.',
        fileUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Home/Lab.jpg',
      },
    ],
  })
  @IsOptional()
  'section-6'?: any;

  @ApiPropertyOptional({
    description: 'Section 7: Student Life & Activities',
    example: [
      {
        title: 'Cultural Festivals',
        description: 'Annual day, drama, and artistic exhibitions.',
        fileUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Home/Festival.jpg',
      },
    ],
  })
  @IsOptional()
  sec7?: any;

  @ApiPropertyOptional({
    description: 'Section 7: Student Life & Activities',
    example: [
      {
        title: 'Cultural Festivals',
        description: 'Annual day and artistic exhibitions.',
      },
    ],
  })
  @IsOptional()
  'section-7'?: any;

  @ApiPropertyOptional({
    description: 'Section 8: Programs & Courses',
    example: [
      {
        heading: 'Academic Programs Offered',
        videoUrl: '/Videos/courses_intro.mp4',
        cards: [
          {
            title: 'Pre-Primary Wing',
            description: 'Foundation learning emphasizing curiosity and motor development.',
            fileUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Home/PrePrimary.jpg',
          },
          {
            title: 'Senior Secondary (XI - XII)',
            description: 'Science, Commerce, and Humanities streams with entrance prep.',
            fileUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Home/Senior.jpg',
          },
        ],
      },
    ],
  })
  @IsOptional()
  sec8?: any;

  @ApiPropertyOptional({
    description: 'Section 8: Programs & Courses',
    example: [
      {
        heading: 'Academic Programs Offered',
        cards: [],
      },
    ],
  })
  @IsOptional()
  'section-8'?: any;

  @ApiPropertyOptional({
    description: 'Section 9: Director Message',
    example: [
      {
        heading: 'Message from the Director',
        name: 'Dr. S. K. Sharma',
        designation: 'Director & Educational Leader',
        message: 'At IPS, we prepare students to not only succeed academically but to lead with empathy and integrity.',
        fileUrl: 'https://res.cloudinary.com/ctpyyyuj/image/upload/f_auto,q_auto/ips-education/assets/Settings/Home/Director.jpeg',
      },
    ],
  })
  @IsOptional()
  sec9?: any;

  @ApiPropertyOptional({
    description: 'Section 9: Director Message',
    example: [
      {
        heading: 'Message from the Director',
        message: 'Leading with empathy and integrity.',
      },
    ],
  })
  @IsOptional()
  'section-9'?: any;

  @ApiPropertyOptional({
    description: 'Testimonials',
    example: [
      {
        name: 'Rajesh Agrawal',
        role: 'Parent of Class X Student',
        feedback: 'IPS has provided my daughter with immense confidence and stellar academic guidance.',
        rating: 5,
      },
    ],
  })
  @IsOptional()
  testimonials?: any;

  @ApiPropertyOptional({
    description: 'Frequently Asked Questions',
    example: [
      {
        question: 'What is the admission procedure for the 2026-27 session?',
        answer: 'Parents can fill the online admission enquiry form or visit the school admissions office with required documents.',
      },
      {
        question: 'Does the school offer school transport facilities?',
        answer: 'Yes, secure bus transport covers all major routes across Sambalpur and adjoining areas.',
      },
    ],
  })
  @IsOptional()
  faq?: any;

  [key: string]: any;
}
